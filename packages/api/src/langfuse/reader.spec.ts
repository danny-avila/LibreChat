import { resolveTraceViewerConfig } from 'librechat-data-provider';
import type { ConversationTraceRefs } from '@librechat/data-schemas';
import type { LangfuseScoreDestination } from './destinations';
import type { TraceQuery } from '~/traces/types';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  }),
  { virtual: true },
);

jest.mock('~/admin/secrets', () => ({
  decryptConfigSecret: jest.fn((value: string) => value),
}));

import { createLangfuseTraceReader, resolveLangfuseReadDestinations } from './reader';
import { getLangfuseDestinationId } from './destinations';
import { TraceReadError } from '~/traces/types';
import { traceIdForMessage } from './trace';

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const FIRST_MESSAGE_AT = new Date(Date.UTC(2026, 8, 12, 11, 0, 0));
const RESPONSE_TRACE = traceIdForMessage('response-1');
const TITLE_TRACE = traceIdForMessage('title-response-1');
const FOREIGN_TRACE = traceIdForMessage('someone-elses-response');

const central: LangfuseScoreDestination = {
  id: 'central-id',
  name: 'central',
  baseUrl: 'https://central.langfuse.test',
  authorization: 'Basic central',
};
const connection: LangfuseScoreDestination = {
  id: 'connection-id',
  name: 'connection',
  baseUrl: 'https://tenant.langfuse.test/base/',
  authorization: 'Basic tenant',
  headers: { 'X-Gateway': 'token' },
};

function createRefs(overrides: Partial<ConversationTraceRefs> = {}): ConversationTraceRefs {
  return {
    firstMessageAt: FIRST_MESSAGE_AT,
    sampledMessages: [{ messageId: 'response-1', langfuseDestinationIds: ['connection-id'] }],
    ...overrides,
  };
}

function createQuery(overrides: Partial<TraceQuery> = {}): TraceQuery {
  return {
    userId: 'owner',
    conversationId: 'convo-1',
    settings: resolveTraceViewerConfig({ enabled: true }),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function observation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'obs-root',
    traceId: RESPONSE_TRACE,
    startTime: '2026-09-12T11:30:00.000Z',
    endTime: '2026-09-12T11:30:05.000Z',
    projectId: 'project',
    parentObservationId: null,
    type: 'AGENT',
    name: 'AgentGraph',
    level: 'DEFAULT',
    statusMessage: '',
    ...overrides,
  };
}

function setup({
  refs = createRefs(),
  destinations = [central, connection],
  responses = [] as Array<Response | Error>,
}: {
  refs?: ConversationTraceRefs;
  destinations?: LangfuseScoreDestination[];
  responses?: Array<Response | Error>;
} = {}) {
  const fetchMock = jest.fn(async (_url: string, _init: RequestInit): Promise<Response> => {
    const next = responses.shift();
    if (next == null) {
      throw new Error('unexpected fetch');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const getConversationTraceRefs = jest.fn(async () => refs);
  /** Same rule as the data-schemas query, which has its own database spec. */
  const hasSampledTraceMessage = jest.fn(async ({ destinationIds }: { destinationIds: string[] }) =>
    refs.sampledMessages.some(
      ({ langfuseDestinationIds }) =>
        langfuseDestinationIds == null ||
        langfuseDestinationIds.some((id) => destinationIds.includes(id)),
    ),
  );
  const resolveDestinations = jest.fn(async () => destinations);
  const reader = createLangfuseTraceReader({
    getConversationTraceRefs,
    hasSampledTraceMessage,
    resolveDestinations,
    fetch: fetchMock,
    now: () => NOW,
  });
  return {
    reader,
    fetchMock,
    getConversationTraceRefs,
    hasSampledTraceMessage,
    resolveDestinations,
  };
}

function requestedUrl(fetchMock: jest.Mock, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call][0]));
}

type FilterCondition = { column: string; operator: string; value: string | string[] };

function requestedFilter(fetchMock: jest.Mock, call = 0): FilterCondition[] {
  return JSON.parse(requestedUrl(fetchMock, call).searchParams.get('filter') ?? '[]');
}

function requestedTraceIds(fetchMock: jest.Mock, call = 0): string[] {
  const condition = requestedFilter(fetchMock, call).find(({ column }) => column === 'traceId');
  return (condition?.value as string[]) ?? [];
}

function tracesOf(...messageIds: string[]): string[] {
  return messageIds.flatMap((id) => [traceIdForMessage(id), traceIdForMessage(`title-${id}`)]);
}

function encodeTestCursor(cursor: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

describe('createLangfuseTraceReader', () => {
  describe('isAvailable', () => {
    it('is unavailable without a sampled response and never reads Langfuse', async () => {
      const { reader, fetchMock, getConversationTraceRefs } = setup({
        refs: createRefs({ sampledMessages: [] }),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: false });
      expect(getConversationTraceRefs).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is unavailable when no configured destination received the trace', async () => {
      const { reader } = setup({
        refs: createRefs({
          sampledMessages: [{ messageId: 'response-1', langfuseDestinationIds: ['retired-id'] }],
        }),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: false });
    });

    it('stays available when only newer responses reached a readable destination', async () => {
      const { reader, hasSampledTraceMessage } = setup({
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-0', langfuseDestinationIds: ['retired-id'] },
            { messageId: 'response-1', langfuseDestinationIds: ['connection-id'] },
          ],
        }),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: true });
      expect(hasSampledTraceMessage).toHaveBeenCalledWith({
        user: 'owner',
        conversationId: 'convo-1',
        destinationIds: ['central-id', 'connection-id'],
      });
    });

    it('explains once when no destination can read traces at all', async () => {
      const { reader, hasSampledTraceMessage } = setup({ destinations: [] });
      const { logger } = jest.requireMock<{ logger: { warn: jest.Mock } }>(
        '@librechat/data-schemas',
      );
      logger.warn.mockClear();

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: false });
      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: false });

      expect(hasSampledTraceMessage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toContain('no destination with read credentials');
    });

    it('answers from one existence query without loading every response or reading Langfuse', async () => {
      const { reader, fetchMock, getConversationTraceRefs, hasSampledTraceMessage } = setup();

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: true });
      expect(hasSampledTraceMessage).toHaveBeenCalledTimes(1);
      expect(getConversationTraceRefs).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('listRecords', () => {
    it('reads the session from the recorded destination with its credentials and window', async () => {
      const { reader, fetchMock } = setup({ responses: [jsonResponse({ data: [], meta: {} })] });

      await expect(reader.listRecords(createQuery())).resolves.toEqual({
        records: [],
        sourceId: 'connection-id',
      });

      const url = requestedUrl(fetchMock);
      expect(url.origin + url.pathname).toBe(
        'https://tenant.langfuse.test/base/api/public/v2/observations',
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        fields: 'core,basic,time,model,usage',
        limit: '1000',
        filter: expect.any(String),
      });
      expect(requestedFilter(fetchMock)).toEqual([
        { type: 'string', column: 'sessionId', operator: '=', value: 'convo-1' },
        {
          type: 'stringOptions',
          column: 'traceId',
          operator: 'any of',
          value: [RESPONSE_TRACE, TITLE_TRACE],
        },
        { type: 'datetime', column: 'startTime', operator: '<', value: '2026-09-12T12:10:00.000Z' },
        {
          type: 'datetime',
          column: 'startTime',
          operator: '>=',
          value: '2026-09-12T10:50:00.000Z',
        },
      ]);
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(new Headers(init.headers).get('Authorization')).toBe('Basic tenant');
      expect(new Headers(init.headers).get('X-Gateway')).toBe('token');
      expect(init.redirect).toBe('error');
    });

    it('prefers the tenant connection over central when both hold the trace', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [observation()] })],
      });

      await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock).origin).toBe('https://tenant.langfuse.test');
    });

    it('reads central when it is the only destination recorded on the messages', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({
          sampledMessages: [{ messageId: 'response-1', langfuseDestinationIds: ['central-id'] }],
        }),
        responses: [jsonResponse({ data: [] })],
      });

      await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock).origin).toBe('https://central.langfuse.test');
    });

    it('reads the project that holds the most responses when a connection arrived mid-conversation', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-0', langfuseDestinationIds: ['central-id'] },
            { messageId: 'response-1', langfuseDestinationIds: ['central-id'] },
            { messageId: 'response-2', langfuseDestinationIds: ['central-id', 'connection-id'] },
          ],
        }),
        responses: [jsonResponse({ data: [observation()] })],
      });

      await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock).origin).toBe('https://central.langfuse.test');
    });

    it('reads the project holding the newest turn first after a conversation moved projects', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'response-0', langfuseDestinationIds: ['central-id'] },
          { messageId: 'response-1', langfuseDestinationIds: ['central-id'] },
          { messageId: 'response-2', langfuseDestinationIds: ['connection-id'] },
        ],
      });
      const { reader, fetchMock } = setup({
        refs,
        responses: [
          jsonResponse({
            data: [observation({ id: 'newest', traceId: traceIdForMessage('response-2') })],
          }),
        ],
      });

      const page = await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock).origin).toBe('https://tenant.langfuse.test');
      expect(page).toMatchObject({ sourceId: 'connection-id', records: [{ id: 'newest' }] });

      const later = setup({ refs, responses: [jsonResponse({ data: [] })] });
      await later.reader.listRecords({ ...createQuery(), cursor: page.nextCursor });

      expect(requestedUrl(later.fetchMock).origin).toBe('https://central.langfuse.test');
    });

    it('pages turns in order when responses went back and forth between projects', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'response-0', langfuseDestinationIds: ['central-id'] },
          { messageId: 'response-1', langfuseDestinationIds: ['connection-id'] },
          { messageId: 'response-2', langfuseDestinationIds: ['central-id'] },
          { messageId: 'response-3', langfuseDestinationIds: ['central-id'] },
        ],
      });
      const turn = (messageId: string) =>
        jsonResponse({
          data: [observation({ id: messageId, traceId: traceIdForMessage(messageId) })],
        });
      const reads: Array<{ origin: string; traceIds: string[]; records: string[] }> = [];
      let cursor: string | undefined;
      for (const response of ['response-2', 'response-1', 'response-0']) {
        const { reader, fetchMock } = setup({ refs, responses: [turn(response)] });
        const page = await reader.listRecords({ ...createQuery(), cursor });
        reads.push({
          origin: requestedUrl(fetchMock).origin,
          traceIds: requestedTraceIds(fetchMock),
          records: page.records.map(({ id }) => id),
        });
        cursor = page.nextCursor;
      }

      expect(reads).toEqual([
        {
          origin: 'https://central.langfuse.test',
          traceIds: tracesOf('response-2', 'response-3'),
          records: ['response-2'],
        },
        {
          origin: 'https://tenant.langfuse.test',
          traceIds: tracesOf('response-1'),
          records: ['response-1'],
        },
        {
          origin: 'https://central.langfuse.test',
          traceIds: tracesOf('response-0'),
          records: ['response-0'],
        },
      ]);
      expect(cursor).toBeUndefined();
    });

    it('bounds how many turns one read asks a project for', async () => {
      const sampledMessages = Array.from({ length: 51 }, (_, index) => ({
        messageId: `response-${index}`,
        langfuseDestinationIds: ['connection-id'],
      }));
      const refs = createRefs({ sampledMessages });
      const first = setup({ refs, responses: [jsonResponse({ data: [observation()] })] });

      const page = await first.reader.listRecords(createQuery());

      expect(requestedTraceIds(first.fetchMock)).toEqual(
        tracesOf(...sampledMessages.slice(1).map(({ messageId }) => messageId)),
      );
      const later = setup({ refs, responses: [jsonResponse({ data: [] })] });
      await later.reader.listRecords({ ...createQuery(), cursor: page.nextCursor });
      expect(requestedTraceIds(later.fetchMock)).toEqual(tracesOf('response-0'));
    });

    it('reads a failed turn from the trace of the run its error row stands for', async () => {
      const runTrace = traceIdForMessage('run-1');
      const { reader, fetchMock } = setup({
        refs: createRefs({
          sampledMessages: [
            {
              messageId: 'user-1_',
              langfuseRunId: 'run-1',
              langfuseDestinationIds: ['connection-id'],
            },
          ],
        }),
        responses: [
          jsonResponse({
            data: [
              observation({ id: 'failed-call', traceId: runTrace, level: 'ERROR' }),
              observation({ id: 'row-id-trace', traceId: traceIdForMessage('user-1_') }),
            ],
          }),
        ],
      });

      const page = await reader.listRecords(createQuery());

      expect(requestedTraceIds(fetchMock)).toEqual(tracesOf('run-1'));
      expect(page.records).toEqual([
        expect.objectContaining({ id: 'failed-call', messageId: 'user-1_', status: 'error' }),
      ]);
    });

    it('reports a page whose observations all fail to parse as an upstream failure', async () => {
      const { reader } = setup({
        responses: [jsonResponse({ data: [{ id: 'renamed-fields', trace_id: RESPONSE_TRACE }] })],
      });

      await expect(reader.listRecords(createQuery())).rejects.toMatchObject({
        code: 'upstream_error',
      });
    });

    it('tries the next readable project when legacy responses left the first one empty', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [
          jsonResponse({ data: [] }),
          jsonResponse({ data: [observation({ id: 'legacy' })] }),
        ],
      });

      const page = await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock, 0).origin).toBe('https://tenant.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://central.langfuse.test');
      expect(page).toMatchObject({ sourceId: 'central-id', records: [{ id: 'legacy' }] });
    });

    it('reaches a project holding legacy turns after the one that holds the newest', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'legacy-response' },
          { messageId: 'response-1', langfuseDestinationIds: ['connection-id'] },
        ],
      });
      const first = setup({
        refs,
        responses: [jsonResponse({ data: [observation({ id: 'newest' })] })],
      });

      const page = await first.reader.listRecords(createQuery());

      expect(page).toMatchObject({ sourceId: 'connection-id', records: [{ id: 'newest' }] });
      expect(page.nextCursor).toBeDefined();

      const later = setup({
        refs,
        responses: [
          jsonResponse({
            data: [observation({ id: 'legacy', traceId: traceIdForMessage('legacy-response') })],
          }),
        ],
      });
      const older = await later.reader.listRecords({ ...createQuery(), cursor: page.nextCursor });

      expect(requestedUrl(later.fetchMock).origin).toBe('https://central.langfuse.test');
      expect(requestedUrl(later.fetchMock).searchParams.has('cursor')).toBe(false);
      expect(requestedTraceIds(first.fetchMock)).toEqual(tracesOf('legacy-response', 'response-1'));
      expect(requestedTraceIds(later.fetchMock)).toEqual(tracesOf('legacy-response'));
      expect(older).toEqual({
        sourceId: 'central-id',
        records: [expect.objectContaining({ id: 'legacy', messageId: 'legacy-response' })],
      });
    });

    it('does not visit a project whose turns an earlier project provably holds', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
          ],
        }),
        responses: [jsonResponse({ data: [observation()] })],
      });

      const page = await reader.listRecords(createQuery());

      expect(page.nextCursor).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('passes the tenant scope to both conversation reads', async () => {
      const { reader, getConversationTraceRefs, hasSampledTraceMessage } = setup({
        responses: [jsonResponse({ data: [observation()] })],
      });

      await reader.isAvailable(createQuery({ tenantId: 'tenant-a' }));
      await reader.listRecords(createQuery({ tenantId: 'tenant-a' }));

      expect(hasSampledTraceMessage).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
      expect(getConversationTraceRefs).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
    });

    it('fails over to a project holding the same turns when the preferred one fails', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
        ],
      });
      const { reader, fetchMock } = setup({
        refs,
        responses: [
          jsonResponse({ message: 'expired key' }, 401),
          jsonResponse({ data: [observation({ id: 'a' })], meta: { cursor: 'more' } }),
        ],
      });

      const page = await reader.listRecords(
        createQuery({ settings: resolveTraceViewerConfig({ enabled: true, maxRecords: 1 }) }),
      );

      expect(requestedUrl(fetchMock, 0).origin).toBe('https://tenant.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://central.langfuse.test');
      expect(page).toMatchObject({ sourceId: 'central-id', records: [{ id: 'a' }] });

      const later = setup({
        refs,
        responses: [jsonResponse({ data: [observation({ id: 'b' })] })],
      });
      const older = await later.reader.listRecords({ ...createQuery(), cursor: page.nextCursor });

      expect(requestedUrl(later.fetchMock).origin).toBe('https://central.langfuse.test');
      expect(requestedUrl(later.fetchMock).searchParams.get('cursor')).toBe('more');
      expect(older.records.map(({ id }) => id)).toEqual(['b']);
    });

    it('reports the failure when every project holding the turns fails, and never fails over mid-project', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
        ],
      });
      const allFail = setup({
        refs,
        responses: [
          jsonResponse({ message: 'expired key' }, 401),
          jsonResponse({ message: 'down' }, 503),
        ],
      });
      const midProject = setup({ refs, responses: [jsonResponse({ message: 'down' }, 503)] });
      const cursor = encodeTestCursor({ m: 'response-1', s: 'connection-id', c: 'more' });

      await expect(allFail.reader.listRecords(createQuery())).rejects.toMatchObject({
        code: 'upstream_error',
      });
      await expect(
        midProject.reader.listRecords({ ...createQuery(), cursor }),
      ).rejects.toMatchObject({ code: 'upstream_error' });
      expect(midProject.fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports a failed project that could hold a turn the empty ones do not', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'legacy-response' }] }),
        responses: [jsonResponse({ data: [] }), jsonResponse({ message: 'down' }, 503)],
      });

      await expect(reader.listRecords(createQuery())).rejects.toMatchObject({
        code: 'upstream_error',
      });
      expect(requestedUrl(fetchMock, 0).origin).toBe('https://tenant.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://central.langfuse.test');
    });

    it('answers empty when a project that answered provably holds every turn of the failed one', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
          ],
        }),
        responses: [jsonResponse({ message: 'expired key' }, 401), jsonResponse({ data: [] })],
      });

      await expect(reader.listRecords(createQuery())).resolves.toEqual({
        records: [],
        sourceId: 'central-id',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a project that failed for newer turns when it is the only one holding older turns', async () => {
      const refs = createRefs({
        sampledMessages: [
          { messageId: 'response-0', langfuseDestinationIds: ['connection-id'] },
          { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
        ],
      });
      const first = setup({
        refs,
        responses: [
          jsonResponse({ message: 'down' }, 503),
          jsonResponse({ data: [observation({ traceId: traceIdForMessage('response-1') })] }),
        ],
      });

      const page = await first.reader.listRecords(createQuery());

      expect(requestedUrl(first.fetchMock, 1).origin).toBe('https://central.langfuse.test');
      expect(requestedTraceIds(first.fetchMock, 1)).toEqual(tracesOf('response-1'));
      const later = setup({ refs, responses: [jsonResponse({ message: 'still down' }, 503)] });
      await expect(
        later.reader.listRecords({ ...createQuery(), cursor: page.nextCursor }),
      ).rejects.toMatchObject({ code: 'upstream_error' });
      expect(requestedUrl(later.fetchMock).origin).toBe('https://tenant.langfuse.test');
    });

    it('treats two credentials for one project as one source instead of replaying its page', async () => {
      const centralAlias = { ...central, id: 'connection-id', authorization: 'Basic alias' };
      const { reader, fetchMock } = setup({
        destinations: [centralAlias, connection],
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [observation()] })],
      });

      const page = await reader.listRecords(createQuery());

      expect(page.nextCursor).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('normalizes owned observations and drops traces the user does not own', async () => {
      const { reader } = setup({
        responses: [
          jsonResponse({
            data: [
              observation(),
              observation({
                id: 'obs-llm',
                parentObservationId: 'obs-root',
                type: 'GENERATION',
                name: 'llm',
                model: 'claude-haiku-4-5',
                completionStartTime: '2026-09-12T11:30:01.000Z',
                usageDetails: {
                  input: 120,
                  output: 30,
                  total: 150,
                  output_reasoning: 10,
                  input_cache_read: 80,
                  input_cache_creation: 40,
                },
                totalCost: 0.0042,
              }),
              observation({
                id: 'obs-tool',
                parentObservationId: 'obs-root',
                type: 'TOOL',
                name: 'web_search',
                endTime: null,
              }),
              observation({
                id: 'obs-failed',
                parentObservationId: 'obs-root',
                type: 'CHAIN',
                name: 'tool-dispatch',
                level: 'ERROR',
                statusMessage: 'Error: Host tool execution failed',
              }),
              observation({
                id: 'obs-title',
                traceId: TITLE_TRACE,
                type: 'CHAIN',
                name: '',
                providedModelName: 'title-model',
              }),
              observation({ id: 'obs-foreign', traceId: FOREIGN_TRACE }),
              { id: 'malformed' },
            ],
          }),
        ],
      });

      const { records } = await reader.listRecords(createQuery());

      expect(records).toEqual([
        {
          id: 'obs-root',
          traceId: RESPONSE_TRACE,
          messageId: 'response-1',
          parentId: null,
          kind: 'agent',
          name: 'AgentGraph',
          startTime: '2026-09-12T11:30:00.000Z',
          endTime: '2026-09-12T11:30:05.000Z',
          status: 'ok',
        },
        {
          id: 'obs-llm',
          traceId: RESPONSE_TRACE,
          messageId: 'response-1',
          parentId: 'obs-root',
          kind: 'generation',
          name: 'llm',
          model: 'claude-haiku-4-5',
          startTime: '2026-09-12T11:30:00.000Z',
          endTime: '2026-09-12T11:30:05.000Z',
          completionStartTime: '2026-09-12T11:30:01.000Z',
          status: 'ok',
          usage: {
            input: 120,
            output: 30,
            total: 150,
            reasoning: 10,
            cacheRead: 80,
            cacheWrite: 40,
          },
          cost: 0.0042,
        },
        {
          id: 'obs-tool',
          traceId: RESPONSE_TRACE,
          messageId: 'response-1',
          parentId: 'obs-root',
          kind: 'tool',
          name: 'web_search',
          startTime: '2026-09-12T11:30:00.000Z',
          status: 'running',
        },
        {
          id: 'obs-failed',
          traceId: RESPONSE_TRACE,
          messageId: 'response-1',
          parentId: 'obs-root',
          kind: 'span',
          name: 'tool-dispatch',
          startTime: '2026-09-12T11:30:00.000Z',
          endTime: '2026-09-12T11:30:05.000Z',
          status: 'error',
          statusMessage: 'Error: Host tool execution failed',
        },
        {
          id: 'obs-title',
          traceId: TITLE_TRACE,
          messageId: 'response-1',
          parentId: null,
          kind: 'span',
          name: 'chain',
          model: 'title-model',
          startTime: '2026-09-12T11:30:00.000Z',
          endTime: '2026-09-12T11:30:05.000Z',
          status: 'ok',
        },
      ]);
    });

    it('follows Langfuse cursors up to maxRecords and returns the next cursor', async () => {
      const { reader, fetchMock } = setup({
        responses: [
          jsonResponse({
            data: [observation({ id: 'a' }), observation({ id: 'b' })],
            meta: { cursor: 'cursor-1' },
          }),
          jsonResponse({ data: [observation({ id: 'c' })], meta: { cursor: 'cursor-2' } }),
        ],
      });

      const page = await reader.listRecords(
        createQuery({ settings: resolveTraceViewerConfig({ enabled: true, maxRecords: 3 }) }),
      );

      expect(page.records.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
      expect(page.nextCursor).toBe(
        encodeTestCursor({ m: 'response-1', s: 'connection-id', c: 'cursor-2' }),
      );
      expect(requestedUrl(fetchMock, 0).searchParams.get('limit')).toBe('3');
      expect(requestedUrl(fetchMock, 0).searchParams.has('cursor')).toBe(false);
      expect(requestedUrl(fetchMock, 1).searchParams.get('limit')).toBe('1');
      expect(requestedUrl(fetchMock, 1).searchParams.get('cursor')).toBe('cursor-1');
    });

    it('continues a cursor from the project that issued it, even after the ranking changed', async () => {
      const first = setup({
        responses: [jsonResponse({ data: [observation({ id: 'a' })], meta: { cursor: 'next' } })],
        refs: createRefs({
          sampledMessages: [{ messageId: 'response-1', langfuseDestinationIds: ['central-id'] }],
        }),
      });
      const { nextCursor, sourceId } = await first.reader.listRecords(
        createQuery({ settings: resolveTraceViewerConfig({ enabled: true, maxRecords: 1 }) }),
      );
      expect(sourceId).toBe('central-id');

      const later = setup({
        responses: [jsonResponse({ data: [observation({ id: 'b' })], meta: { cursor: null } })],
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-1', langfuseDestinationIds: ['central-id'] },
            { messageId: 'response-2', langfuseDestinationIds: ['connection-id'] },
            { messageId: 'response-3', langfuseDestinationIds: ['connection-id'] },
          ],
        }),
      });
      const page = await later.reader.listRecords({ ...createQuery(), cursor: nextCursor });

      expect(page).toMatchObject({ sourceId: 'central-id' });
      expect(page.nextCursor).toBeUndefined();
      expect(requestedUrl(later.fetchMock).origin).toBe('https://central.langfuse.test');
      expect(requestedUrl(later.fetchMock).searchParams.get('cursor')).toBe('next');
    });

    it('keeps paging a project whose id resolved after the first page', async () => {
      const unresolvedCentral = { ...central, id: undefined };
      const first = setup({
        destinations: [unresolvedCentral],
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [observation({ id: 'a' })], meta: { cursor: 'next' } })],
      });
      const { nextCursor, sourceId } = await first.reader.listRecords(
        createQuery({ settings: resolveTraceViewerConfig({ enabled: true, maxRecords: 1 }) }),
      );
      const later = setup({
        destinations: [central],
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [observation({ id: 'b' })] })],
      });

      const page = await later.reader.listRecords({ ...createQuery(), cursor: nextCursor });

      expect(sourceId).toBe('name:central');
      expect(page.records.map(({ id }) => id)).toEqual(['b']);
    });

    it('rejects a forged cursor and one for a project the conversation can no longer read', async () => {
      const { reader, fetchMock } = setup();
      const retired = encodeTestCursor({ m: 'response-1', s: 'retired-id', c: 'next' });
      const vanished = encodeTestCursor({ m: 'deleted-response' });

      await expect(
        reader.listRecords({ ...createQuery(), cursor: 'bm90IGpzb24' }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
      await expect(reader.listRecords({ ...createQuery(), cursor: retired })).rejects.toMatchObject(
        {
          code: 'invalid_request',
        },
      );
      await expect(
        reader.listRecords({ ...createQuery(), cursor: vanished }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports a conversation without an eligible trace as not found', async () => {
      const { reader, fetchMock } = setup({ refs: createRefs({ sampledMessages: [] }) });

      await expect(reader.listRecords(createQuery())).rejects.toMatchObject({ code: 'not_found' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [404, 'unsupported'],
      [429, 'rate_limited'],
      [500, 'upstream_error'],
      [400, 'upstream_error'],
    ])('maps a Langfuse %s to %s', async (status, code) => {
      const { reader } = setup({ responses: [jsonResponse({ message: 'nope' }, status)] });

      const error = await reader.listRecords(createQuery()).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TraceReadError);
      expect(error).toMatchObject({ code });
    });

    it('treats a cursor Langfuse rejects as an invalid request', async () => {
      const { reader } = setup({ responses: [jsonResponse({ message: 'bad cursor' }, 400)] });
      const cursor = encodeTestCursor({ m: 'response-1', s: 'connection-id', c: 'expired' });

      await expect(reader.listRecords({ ...createQuery(), cursor })).rejects.toMatchObject({
        code: 'invalid_request',
      });
    });

    it('stops the Langfuse request when the client goes away', async () => {
      const controller = new AbortController();
      const fetchMock = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            controller.abort();
          }),
      );
      const reader = createLangfuseTraceReader({
        getConversationTraceRefs: async () => createRefs(),
        hasSampledTraceMessage: async () => true,
        resolveDestinations: async () => [connection],
        fetch: fetchMock,
        now: () => NOW,
      });

      await expect(
        reader.listRecords(createQuery({ signal: controller.signal })),
      ).rejects.toMatchObject({ code: 'upstream_error', message: 'The trace read was cancelled' });
      expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
    });

    it('bounds each Langfuse request by the configured timeout', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      const { reader } = setup({ responses: [jsonResponse({ data: [] })] });

      await reader.listRecords(
        createQuery({
          settings: resolveTraceViewerConfig({ enabled: true, requestTimeoutMs: 45_000 }),
        }),
      );

      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
      timeoutSpy.mockRestore();
    });

    it('treats a point-in-time event without an end as completed, not running', async () => {
      const { reader } = setup({
        responses: [
          jsonResponse({
            data: [
              observation({ id: 'event', type: 'EVENT', name: 'checkpoint', endTime: null }),
              observation({ id: 'open-span', type: 'SPAN', endTime: null }),
            ],
          }),
        ],
      });

      const { records } = await reader.listRecords(createQuery());

      expect(records.find(({ id }) => id === 'event')).toMatchObject({
        kind: 'event',
        status: 'ok',
        endTime: '2026-09-12T11:30:00.000Z',
      });
      expect(records.find(({ id }) => id === 'open-span')).toMatchObject({ status: 'running' });
      expect(records.find(({ id }) => id === 'open-span')).not.toHaveProperty('endTime');
    });

    it('maps an aborted request to a timeout and a broken body to an upstream error', async () => {
      const timeout = new Error('The operation was aborted due to timeout');
      timeout.name = 'TimeoutError';
      const { reader } = setup({
        responses: [timeout, new Response('<html>', { status: 200 })],
      });

      await expect(reader.listRecords(createQuery())).rejects.toMatchObject({ code: 'timeout' });
      await expect(reader.listRecords(createQuery())).rejects.toMatchObject({
        code: 'upstream_error',
      });
    });
  });

  describe('getRecord', () => {
    it('reads one observation by id within the session and withholds content by default', async () => {
      const { reader, fetchMock } = setup({
        responses: [jsonResponse({ data: [observation({ input: 'secret prompt' })] })],
      });

      const detail = await reader.getRecord({ ...createQuery(), recordId: 'obs-root' });

      expect(detail).toEqual({
        record: expect.objectContaining({ id: 'obs-root', messageId: 'response-1' }),
        contentAvailable: false,
      });
      const params = requestedUrl(fetchMock).searchParams;
      expect(params.get('fields')).toBe('core,basic,time,model,usage');
      expect(JSON.parse(params.get('filter') ?? '[]')).toEqual([
        { type: 'string', column: 'id', operator: '=', value: 'obs-root' },
        { type: 'string', column: 'sessionId', operator: '=', value: 'convo-1' },
        { type: 'datetime', column: 'startTime', operator: '<', value: '2026-09-12T12:10:00.000Z' },
        {
          type: 'datetime',
          column: 'startTime',
          operator: '>=',
          value: '2026-09-12T10:50:00.000Z',
        },
      ]);
    });

    it('returns truncated input, output and metadata when the deployment allows it', async () => {
      const { reader, fetchMock } = setup({
        responses: [
          jsonResponse({
            data: [
              observation({
                input: '{"messages":[{"role":"user","content":"hello"}]}',
                output: 'short',
                metadata: { agentId: 'agent_1' },
              }),
            ],
          }),
        ],
      });

      const detail = await reader.getRecord({
        ...createQuery({
          settings: resolveTraceViewerConfig({
            enabled: true,
            showInputOutput: true,
            maxContentLength: 12,
          }),
        }),
        recordId: 'obs-root',
      });

      expect(requestedUrl(fetchMock).searchParams.get('fields')).toBe(
        'core,basic,time,model,usage,io,metadata',
      );
      expect(detail).toMatchObject({
        contentAvailable: true,
        input: { value: '{"messages":', truncated: true },
        output: { value: 'short', truncated: false },
        metadata: { value: '{"agentId":"', truncated: true },
      });
    });

    it('reads the detail from the project that listed the record', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [
          jsonResponse({ data: [observation()] }),
          jsonResponse({ data: [observation()] }),
        ],
      });

      await reader.getRecord({ ...createQuery(), recordId: 'obs-root', sourceId: 'central-id' });
      await reader.getRecord({ ...createQuery(), recordId: 'obs-root', sourceId: 'retired-id' });

      expect(requestedUrl(fetchMock, 0).origin).toBe('https://central.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://tenant.langfuse.test');
    });

    it('fails over a detail read when the pinned project fails', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [
          jsonResponse({ message: 'down' }, 503),
          jsonResponse({ data: [observation()] }),
        ],
      });

      const detail = await reader.getRecord({
        ...createQuery(),
        recordId: 'obs-root',
        sourceId: 'connection-id',
      });

      expect(detail?.record.id).toBe('obs-root');
      expect(requestedUrl(fetchMock, 0).origin).toBe('https://tenant.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://central.langfuse.test');
    });

    it('keeps probing projects when one answers without the record', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [] }), jsonResponse({ data: [observation()] })],
      });

      const detail = await reader.getRecord({
        ...createQuery(),
        recordId: 'obs-root',
        sourceId: 'retired-id',
      });

      expect(detail?.record.id).toBe('obs-root');
      expect(requestedUrl(fetchMock, 0).origin).toBe('https://tenant.langfuse.test');
      expect(requestedUrl(fetchMock, 1).origin).toBe('https://central.langfuse.test');
    });

    it('skips a project whose turns an answered one provably holds, and reports a failure that could hide the record', async () => {
      const fanout = setup({
        refs: createRefs({
          sampledMessages: [
            { messageId: 'response-1', langfuseDestinationIds: ['central-id', 'connection-id'] },
          ],
        }),
        responses: [jsonResponse({ data: [] })],
      });
      const legacy = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ message: 'down' }, 503), jsonResponse({ data: [] })],
      });

      await expect(
        fanout.reader.getRecord({ ...createQuery(), recordId: 'obs-root' }),
      ).resolves.toBeNull();
      expect(fanout.fetchMock).toHaveBeenCalledTimes(1);
      await expect(
        legacy.reader.getRecord({ ...createQuery(), recordId: 'obs-root' }),
      ).rejects.toMatchObject({ code: 'upstream_error' });
      expect(legacy.fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reads the record detail of a failed turn from the trace of its run', async () => {
      const { reader } = setup({
        refs: createRefs({
          sampledMessages: [
            {
              messageId: 'user-1_',
              langfuseRunId: 'run-1',
              langfuseDestinationIds: ['central-id'],
            },
          ],
        }),
        responses: [jsonResponse({ data: [observation({ traceId: traceIdForMessage('run-1') })] })],
      });

      const detail = await reader.getRecord({ ...createQuery(), recordId: 'obs-root' });

      expect(detail?.record).toMatchObject({ id: 'obs-root', messageId: 'user-1_' });
    });

    it('returns null for an observation outside the user-owned traces', async () => {
      const { reader } = setup({
        responses: [jsonResponse({ data: [observation({ traceId: FOREIGN_TRACE })] })],
      });

      await expect(reader.getRecord({ ...createQuery(), recordId: 'obs-root' })).resolves.toBe(
        null,
      );
    });
  });

  describe('default destinations', () => {
    const envKeys = [
      'LANGFUSE_PUBLIC_KEY',
      'LANGFUSE_SECRET_KEY',
      'LANGFUSE_PROJECT_ID',
      'LANGFUSE_BASE_URL',
      'LANGFUSE_TRACING_ENABLED',
      'LANGFUSE_SAMPLE_RATE',
    ];

    afterEach(() => {
      for (const key of envKeys) {
        delete process.env[key];
      }
    });

    it('reads the central project with the credentials that exported the trace', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_PROJECT_ID = 'central-project';
      process.env.LANGFUSE_BASE_URL = 'https://self-hosted.langfuse.test';
      const fetchMock = jest.fn(
        async (_url: string, _init: RequestInit): Promise<Response> => jsonResponse({ data: [] }),
      );
      const reader = createLangfuseTraceReader({
        resolveDestinations: resolveLangfuseReadDestinations,
        hasSampledTraceMessage: async () => true,
        getConversationTraceRefs: async () =>
          createRefs({
            sampledMessages: [
              {
                messageId: 'response-1',
                langfuseDestinationIds: [
                  getLangfuseDestinationId('https://self-hosted.langfuse.test', 'central-project'),
                ],
              },
            ],
          }),
        fetch: fetchMock,
        now: () => NOW,
      });

      await reader.listRecords(createQuery());

      const [url, init] = fetchMock.mock.calls[0];
      expect(new URL(url).origin).toBe('https://self-hosted.langfuse.test');
      expect(new Headers(init.headers).get('Authorization')).toBe(
        `Basic ${Buffer.from('pk:sk').toString('base64')}`,
      );
    });

    it('never waits on the central project lookup, and asks the client to check again', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-slow';
      process.env.LANGFUSE_SECRET_KEY = 'sk-slow';
      process.env.LANGFUSE_BASE_URL = 'https://slow.langfuse.test';
      const lookup = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
      const hasSampledTraceMessage = jest.fn(async () => false);
      const reader = createLangfuseTraceReader({
        getConversationTraceRefs: async () => createRefs(),
        hasSampledTraceMessage,
        resolveDestinations: resolveLangfuseReadDestinations,
        fetch: jest.fn(),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({
        available: false,
        retryAfterMs: 30_000,
      });

      expect(lookup).toHaveBeenCalledWith(
        'https://slow.langfuse.test/api/public/projects',
        expect.anything(),
      );
      expect(hasSampledTraceMessage).toHaveBeenCalledWith(
        expect.objectContaining({ destinationIds: [] }),
      );
      lookup.mockRestore();
    });

    it('is unavailable while tracing is disabled', async () => {
      process.env.LANGFUSE_PUBLIC_KEY = 'pk';
      process.env.LANGFUSE_SECRET_KEY = 'sk';
      process.env.LANGFUSE_PROJECT_ID = 'central-project';
      process.env.LANGFUSE_TRACING_ENABLED = 'false';
      const hasSampledTraceMessage = jest.fn(async () => true);
      const reader = createLangfuseTraceReader({
        getConversationTraceRefs: async () =>
          createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        hasSampledTraceMessage,
        resolveDestinations: resolveLangfuseReadDestinations,
        fetch: jest.fn(),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toEqual({ available: false });
      expect(hasSampledTraceMessage).not.toHaveBeenCalled();
    });
  });
});
