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
 * Orders the projects a conversation can be read from: the destination that
 * received the most of its sampled responses first, then the tenant's own
 * project over central. A connection enabled mid-conversation holds only the
 * later turns, so preference alone would hide every turn exported before it. A
 * message with no recorded destinations predates the record and could be in
 * any of them; a destination no message could be in is dropped.
 */
function rankDestinations(
  destinations: LangfuseScoreDestination[],
  messages: SampledTraceMessage[],
): LangfuseScoreDestination[] {
  return destinations
    .map((destination) => ({
      destination,
      coverage: messages.filter(
        ({ langfuseDestinationIds }) =>
          langfuseDestinationIds == null ||
          (destination.id != null && langfuseDestinationIds.includes(destination.id)),
      ).length,
    }))
    .filter(({ coverage }) => coverage > 0)
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        DESTINATION_PREFERENCE[a.destination.name] - DESTINATION_PREFERENCE[b.destination.name],
    )
    .map(({ destination }) => destination);
}

/** Stable, opaque identity of a destination; its project hash when Langfuse gave one. */
function sourceIdOf(destination: LangfuseScoreDestination): string {
  return destination.id ?? `name:${destination.name}`;
}

/** A destination named before its project id resolved still matches once the id arrives. */
function isSource(destination: LangfuseScoreDestination, sourceId?: string): boolean {
  return (
    sourceId != null &&
    (sourceIdOf(destination) === sourceId || `name:${destination.name}` === sourceId)
  );
}

const cursorSchema = z.object({ s: z.string().min(1), c: z.string().min(1) });

/** Binds a Langfuse cursor to the project that issued it, so every page of a read comes from one project. */
function encodeCursor(sourceId: string, cursor: string): string {
  return Buffer.from(JSON.stringify({ s: sourceId, c: cursor }), 'utf8').toString('base64url');
}

function decodeCursor(value: string): z.infer<typeof cursorSchema> {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    );
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    /* falls through to the rejection below */
  }
  throw new TraceReadError('invalid_request', 'The page cursor is not one this server issued');
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
  /** Never waits on the central project lookup: the process starts it at boot,
   *  and a read must not stall behind a slow `/api/public/projects` call that
   *  `requestTimeoutMs` does not govern. Until it resolves, central reads only
   *  responses recorded without destination ids. */
  resolveDestinations = (appConfig) =>
    getScoreDestinations(appConfig, '', true, { waitForCentralProjectId: false }),
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

  async function loadConversation(query: TraceQuery) {
    const [refs, destinations] = await Promise.all([
      getConversationTraceRefs({ user: query.userId, conversationId: query.conversationId }),
      readableDestinations(query.appConfig),
    ]);
    return { refs, ranked: rankDestinations(destinations, refs.sampledMessages) };
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
    query: TraceQuery,
    hasCursor: boolean,
  ): Promise<z.infer<typeof pageSchema>> {
    const url = `${destination.baseUrl.replace(/\/+$/, '')}${OBSERVATIONS_PATH}?${params.toString()}`;
    const timeout = AbortSignal.timeout(query.settings.requestTimeoutMs);
    const signal = query.signal ? AbortSignal.any([query.signal, timeout]) : timeout;
    const failed = (error: unknown, fallback: TraceReadError): TraceReadError => {
      if (query.signal?.aborted) {
        return new TraceReadError('upstream_error', 'The trace read was cancelled');
      }
      return isTimeout(error)
        ? new TraceReadError('timeout', 'Langfuse did not respond in time')
        : fallback;
    };

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: mergeHeaders(destination.headers, { Authorization: destination.authorization }),
        signal,
        ...redirectPolicyFor(destination.headers),
      });
    } catch (error) {
      throw failed(
        error,
        new TraceReadError(
          'upstream_error',
          `Langfuse request failed: ${error instanceof Error ? error.name : 'unknown error'}`,
        ),
      );
    }
    if (!response.ok) {
      throw statusError(response.status, hasCursor);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw failed(
        error,
        new TraceReadError('upstream_error', 'Langfuse returned an invalid response'),
      );
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
      const continuation = query.cursor != null ? decodeCursor(query.cursor) : undefined;
      const { refs, ranked } = await loadConversation(query);
      const destination =
        continuation != null
          ? ranked.find((candidate) => isSource(candidate, continuation.s))
          : ranked[0];
      if (!destination) {
        throw continuation != null
          ? new TraceReadError(
              'invalid_request',
              'The page cursor names a source this conversation cannot read',
            )
          : new TraceReadError('not_found', 'No sampled trace for this conversation');
      }
      const sourceId = sourceIdOf(destination);
      const owners = buildTraceOwners(refs.sampledMessages);
      const window = timeWindow(refs);
      const records: TTraceRecord[] = [];
      let cursor = continuation?.c;
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
        const page = await requestPage(destination, params, query, cursor != null);
        for (const { observation, messageId } of parseRows(page.data, owners)) {
          records.push(toRecord(observation, messageId));
        }
        remaining -= page.data.length;
        const next = page.meta?.cursor || undefined;
        if (!next || page.data.length === 0) {
          return { records, sourceId };
        }
        if (remaining <= 0) {
          return { records, sourceId, nextCursor: encodeCursor(sourceId, next) };
        }
        cursor = next;
      }
    },

    async getRecord(query) {
      const { refs, ranked } = await loadConversation(query);
      const destination =
        ranked.find((candidate) => isSource(candidate, query.sourceId)) ?? ranked[0];
      if (!destination) {
        return null;
      }
      const owners = buildTraceOwners(refs.sampledMessages);
      const window = timeWindow(refs);
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
      const page = await requestPage(destination, params, query, false);
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
