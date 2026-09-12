import { z } from 'zod';
import { logger } from '@librechat/data-schemas';
import type {
  TTraceUsage,
  TTraceRecord,
  TTraceStatus,
  TTraceContent,
  TTraceRecordKind,
} from 'librechat-data-provider';
import type {
  AppConfig,
  ConversationTraceRefs,
  SampledTraceMessage,
} from '@librechat/data-schemas';
import type { LangfuseScoreDestination } from './destinations';
import type { TraceQuery, TraceReader } from '~/traces/types';
import { getScoreDestinations } from './destinations';
import { TraceReadError } from '~/traces/types';
import { mergeHeaders } from '~/utils/headers';
import { redirectPolicyFor } from './utils';
import { traceIdForMessage } from './trace';

const OBSERVATIONS_PATH = '/api/public/v2/observations';
const MAX_PAGE_SIZE = 1000;
/** Langfuse stamps observations with the exporting server's clock; the margin
 *  absorbs skew between that clock and the database's message timestamps. */
const TIME_WINDOW_MARGIN_MS = 10 * 60 * 1000;
const NAME_MAX_LENGTH = 200;
const STATUS_MESSAGE_MAX_LENGTH = 1000;
const LIST_FIELDS = 'core,basic,time,model,usage';
const DETAIL_FIELDS = `${LIST_FIELDS},io,metadata`;
const DESTINATION_PREFERENCE: Record<LangfuseScoreDestination['name'], number> = {
  connection: 0,
  tenant: 1,
  central: 2,
};

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const observationSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  startTime: timestampSchema,
  endTime: timestampSchema.nullish(),
  parentObservationId: z.string().nullish(),
  type: z.string(),
  name: z.string().nullish(),
  level: z.string().nullish(),
  statusMessage: z.string().nullish(),
  completionStartTime: timestampSchema.nullish(),
  /** Langfuse Cloud serves the `model` field group as `model`; its SDK types name it `providedModelName`. */
  model: z.string().nullish(),
  providedModelName: z.string().nullish(),
  usageDetails: z.record(z.number()).nullish(),
  costDetails: z.record(z.number()).nullish(),
  totalCost: z.number().nullish(),
  input: z.unknown(),
  output: z.unknown(),
  metadata: z.unknown(),
});
const pageSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({ cursor: z.string().nullish() }).partial().nullish(),
});

type LangfuseObservation = z.infer<typeof observationSchema>;
type OwnedObservation = { observation: LangfuseObservation; messageId: string };

export interface LangfuseTraceReaderDeps {
  getConversationTraceRefs: (input: {
    user: string;
    conversationId: string;
  }) => Promise<ConversationTraceRefs>;
  hasSampledTraceMessage: (input: {
    user: string;
    conversationId: string;
    destinationIds: string[];
  }) => Promise<boolean>;
  /** Defaults to the destinations feedback scores use, which carry the read credentials. */
  resolveDestinations?: (appConfig?: AppConfig) => Promise<LangfuseScoreDestination[]>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
}

const KIND_BY_TYPE: Record<string, TTraceRecordKind> = {
  AGENT: 'agent',
  GENERATION: 'generation',
  EMBEDDING: 'generation',
  TOOL: 'tool',
  RETRIEVER: 'tool',
  EVENT: 'event',
};

function clamp(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function toStatus(observation: LangfuseObservation, endTime?: string | null): TTraceStatus {
  if (observation.level === 'ERROR') {
    return 'error';
  }
  if (observation.level === 'WARNING') {
    return 'warning';
  }
  return endTime ? 'ok' : 'running';
}

function usageValue(details: Record<string, number>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = details[key];
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function toUsage(details?: Record<string, number> | null): TTraceUsage | undefined {
  if (!details) {
    return undefined;
  }
  const usage: TTraceUsage = {
    input: usageValue(details, 'input', 'input_tokens', 'prompt_tokens'),
    output: usageValue(details, 'output', 'output_tokens', 'completion_tokens'),
    total: usageValue(details, 'total', 'total_tokens'),
    reasoning: usageValue(details, 'output_reasoning', 'reasoning', 'reasoning_tokens'),
    cacheRead: usageValue(details, 'input_cache_read', 'cache_read', 'cache_read_input_tokens'),
    cacheWrite: usageValue(
      details,
      'input_cache_creation',
      'input_cache_write',
      'cache_creation',
      'cache_creation_input_tokens',
    ),
  };
  const entries = Object.entries(usage).filter(([, value]) => value != null);
  return entries.length > 0 ? (Object.fromEntries(entries) as TTraceUsage) : undefined;
}

function toCost(observation: LangfuseObservation): number | undefined {
  const cost = observation.totalCost ?? observation.costDetails?.total;
  return cost != null && Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

function toRecord(observation: LangfuseObservation, messageId: string): TTraceRecord {
  const type = observation.type.toUpperCase();
  /** An event is a point in time and is never given an end, so a missing end is not "running". */
  const endTime = observation.endTime ?? (type === 'EVENT' ? observation.startTime : null);
  const status = toStatus(observation, endTime);
  const name = observation.name?.trim() || observation.type.toLowerCase();
  const statusMessage = observation.statusMessage?.trim();
  const model = (observation.model ?? observation.providedModelName)?.trim();
  const usage = toUsage(observation.usageDetails);
  const cost = toCost(observation);
  return {
    id: observation.id,
    traceId: observation.traceId,
    messageId,
    parentId: observation.parentObservationId || null,
    kind: KIND_BY_TYPE[type] ?? 'span',
    name: clamp(name, NAME_MAX_LENGTH),
    startTime: new Date(observation.startTime).toISOString(),
    status,
    ...(model ? { model: clamp(model, NAME_MAX_LENGTH) } : {}),
    ...(endTime ? { endTime: new Date(endTime).toISOString() } : {}),
    ...(observation.completionStartTime
      ? { completionStartTime: new Date(observation.completionStartTime).toISOString() }
      : {}),
    ...(statusMessage && (status === 'error' || status === 'warning')
      ? { statusMessage: clamp(statusMessage, STATUS_MESSAGE_MAX_LENGTH) }
      : {}),
    ...(usage ? { usage } : {}),
    ...(cost != null ? { cost } : {}),
  };
}

function toContent(value: unknown, maxLength: number): TTraceContent | undefined {
  if (value == null) {
    return undefined;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text == null || text === '' || text === '{}' || text === 'null') {
    return undefined;
  }
  return text.length > maxLength
    ? { value: text.slice(0, maxLength), truncated: true }
    : { value: text, truncated: false };
}

/**
 * Maps every trace a conversation's sampled responses can own to the response
 * that owns it: the run itself, and its title run. Langfuse sessions are keyed
 * only by conversation id, which is unique per user rather than globally, so a
 * record whose trace is not in this map is never returned.
 */
function buildTraceOwners(messages: SampledTraceMessage[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const { messageId } of messages) {
    owners.set(traceIdForMessage(messageId), messageId);
    owners.set(traceIdForMessage(`title-${messageId}`), messageId);
  }
  return owners;
}

/**
 * Picks the one project to read: the destination that received the most of the
 * conversation's sampled responses, then the tenant's own project over central.
 * A connection enabled mid-conversation holds only the later turns, so
 * preference alone would hide every turn exported before it. A message with no
 * recorded destinations predates the record and could be in any of them.
 */
function selectDestination(
  destinations: LangfuseScoreDestination[],
  messages: SampledTraceMessage[],
): LangfuseScoreDestination | undefined {
  let selected: LangfuseScoreDestination | undefined;
  let selectedCoverage = 0;
  for (const destination of destinations) {
    const coverage = messages.filter(
      ({ langfuseDestinationIds }) =>
        langfuseDestinationIds == null ||
        (destination.id != null && langfuseDestinationIds.includes(destination.id)),
    ).length;
    const better =
      coverage > selectedCoverage ||
      (coverage > 0 &&
        coverage === selectedCoverage &&
        selected != null &&
        DESTINATION_PREFERENCE[destination.name] < DESTINATION_PREFERENCE[selected.name]);
    if (better) {
      selected = destination;
      selectedCoverage = coverage;
    }
  }
  return selected;
}

function statusError(status: number, hasCursor: boolean): TraceReadError {
  if (status === 401 || status === 403) {
    return new TraceReadError('unauthorized', `Langfuse responded with ${status}`);
  }
  if (status === 404) {
    return new TraceReadError(
      'unsupported',
      'Langfuse has no v2 Observations API at this destination (self-hosted releases before v4)',
    );
  }
  if (status === 429) {
    return new TraceReadError('rate_limited', 'Langfuse is rate limiting trace reads');
  }
  if (status === 400 && hasCursor) {
    return new TraceReadError('invalid_request', 'Langfuse rejected the page cursor');
  }
  return new TraceReadError('upstream_error', `Langfuse responded with ${status}`);
}

/** Configuration problems already reported, so a per-request check cannot flood the log. */
const reportedWarnings = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (reportedWarnings.has(key)) {
    return;
  }
  reportedWarnings.add(key);
  logger.warn(message);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function createLangfuseTraceReader({
  getConversationTraceRefs,
  hasSampledTraceMessage,
  resolveDestinations = (appConfig) =>
    getScoreDestinations(appConfig, '', true, { waitForCentralProjectId: true }),
  fetch: fetchImpl = (input, init) => fetch(input, init),
  now = Date.now,
}: LangfuseTraceReaderDeps): TraceReader {
  async function readableDestinations(appConfig?: AppConfig): Promise<LangfuseScoreDestination[]> {
    const destinations = await resolveDestinations(appConfig);
    if (destinations.length === 0) {
      warnOnce(
        'no_destination',
        '[traces] The trace viewer is enabled, but Langfuse tracing is disabled or has no destination with read credentials, so no conversation shows a trace.',
      );
    }
    return destinations;
  }

  async function resolveTarget(query: TraceQuery) {
    const [refs, destinations] = await Promise.all([
      getConversationTraceRefs({ user: query.userId, conversationId: query.conversationId }),
      readableDestinations(query.appConfig),
    ]);
    const destination = selectDestination(destinations, refs.sampledMessages);
    return destination ? { refs, destination } : undefined;
  }

  function timeWindow(refs: ConversationTraceRefs): { from?: string; to: string } {
    const earliest = [refs.firstMessageAt, refs.sampledMessages[0]?.createdAt]
      .map((value) => (value == null ? Number.NaN : new Date(value).getTime()))
      .filter((value) => Number.isFinite(value));
    return {
      ...(earliest.length > 0
        ? { from: new Date(Math.min(...earliest) - TIME_WINDOW_MARGIN_MS).toISOString() }
        : {}),
      to: new Date(now() + TIME_WINDOW_MARGIN_MS).toISOString(),
    };
  }

  async function requestPage(
    destination: LangfuseScoreDestination,
    params: URLSearchParams,
    { hasCursor, timeoutMs }: { hasCursor: boolean; timeoutMs: number },
  ): Promise<z.infer<typeof pageSchema>> {
    const url = `${destination.baseUrl.replace(/\/+$/, '')}${OBSERVATIONS_PATH}?${params.toString()}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: mergeHeaders(destination.headers, { Authorization: destination.authorization }),
        signal: AbortSignal.timeout(timeoutMs),
        ...redirectPolicyFor(destination.headers),
      });
    } catch (error) {
      if (isTimeout(error)) {
        throw new TraceReadError('timeout', 'Langfuse did not respond in time');
      }
      throw new TraceReadError(
        'upstream_error',
        `Langfuse request failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
    }
    if (!response.ok) {
      throw statusError(response.status, hasCursor);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isTimeout(error)) {
        throw new TraceReadError('timeout', 'Langfuse did not respond in time');
      }
      throw new TraceReadError('upstream_error', 'Langfuse returned an invalid response');
    }
    const parsed = pageSchema.safeParse(body);
    if (!parsed.success) {
      throw new TraceReadError('upstream_error', 'Langfuse returned an unexpected response');
    }
    return parsed.data;
  }

  function parseRows(rows: unknown[], owners: Map<string, string>): OwnedObservation[] {
    const observations: OwnedObservation[] = [];
    let malformed = 0;
    for (const row of rows) {
      const parsed = observationSchema.safeParse(row);
      if (!parsed.success) {
        malformed++;
        continue;
      }
      const messageId = owners.get(parsed.data.traceId);
      if (messageId != null) {
        observations.push({ observation: parsed.data, messageId });
      }
    }
    if (malformed > 0) {
      logger.warn(`[langfuse] Skipped ${malformed} malformed observation(s) in a trace read`);
    }
    return observations;
  }

  return {
    async isAvailable(query) {
      const destinations = await readableDestinations(query.appConfig);
      if (destinations.length === 0) {
        return false;
      }
      return hasSampledTraceMessage({
        user: query.userId,
        conversationId: query.conversationId,
        destinationIds: destinations.flatMap(({ id }) => (id != null ? [id] : [])),
      });
    },

    async listRecords(query) {
      const target = await resolveTarget(query);
      if (!target) {
        throw new TraceReadError('not_found', 'No sampled trace for this conversation');
      }
      const owners = buildTraceOwners(target.refs.sampledMessages);
      const window = timeWindow(target.refs);
      const records: TTraceRecord[] = [];
      let cursor = query.cursor;
      let remaining = query.settings.maxRecords;

      for (;;) {
        const params = new URLSearchParams({
          sessionId: query.conversationId,
          fields: LIST_FIELDS,
          limit: String(Math.min(MAX_PAGE_SIZE, remaining)),
          toStartTime: window.to,
        });
        if (window.from) {
          params.set('fromStartTime', window.from);
        }
        if (cursor) {
          params.set('cursor', cursor);
        }
        const page = await requestPage(target.destination, params, {
          hasCursor: cursor != null,
          timeoutMs: query.settings.requestTimeoutMs,
        });
        for (const { observation, messageId } of parseRows(page.data, owners)) {
          records.push(toRecord(observation, messageId));
        }
        remaining -= page.data.length;
        const next = page.meta?.cursor || undefined;
        if (!next || page.data.length === 0) {
          return { records };
        }
        if (remaining <= 0) {
          return { records, nextCursor: next };
        }
        cursor = next;
      }
    },

    async getRecord(query) {
      const target = await resolveTarget(query);
      if (!target) {
        return null;
      }
      const owners = buildTraceOwners(target.refs.sampledMessages);
      const window = timeWindow(target.refs);
      const includeContent = query.settings.showInputOutput;
      const filter = [
        { type: 'string', column: 'id', operator: '=', value: query.recordId },
        { type: 'string', column: 'sessionId', operator: '=', value: query.conversationId },
        { type: 'datetime', column: 'startTime', operator: '<', value: window.to },
        ...(window.from
          ? [{ type: 'datetime', column: 'startTime', operator: '>=', value: window.from }]
          : []),
      ];
      const params = new URLSearchParams({
        fields: includeContent ? DETAIL_FIELDS : LIST_FIELDS,
        limit: '1',
        filter: JSON.stringify(filter),
      });
      const page = await requestPage(target.destination, params, {
        hasCursor: false,
        timeoutMs: query.settings.requestTimeoutMs,
      });
      const match = parseRows(page.data, owners).find(
        ({ observation }) => observation.id === query.recordId,
      );
      if (!match) {
        return null;
      }
      const { observation, messageId } = match;
      const record = toRecord(observation, messageId);
      if (!includeContent) {
        return { record, contentAvailable: false };
      }
      const maxLength = query.settings.maxContentLength;
      const input = toContent(observation.input, maxLength);
      const output = toContent(observation.output, maxLength);
      const metadata = toContent(observation.metadata, maxLength);
      return {
        record,
        contentAvailable: true,
        ...(input ? { input } : {}),
        ...(output ? { output } : {}),
        ...(metadata ? { metadata } : {}),
      };
    },
  };
}
