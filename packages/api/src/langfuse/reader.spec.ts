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

import { createLangfuseTraceReader } from './reader';
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

describe('createLangfuseTraceReader', () => {
  describe('isAvailable', () => {
    it('is unavailable without a sampled response and never reads Langfuse', async () => {
      const { reader, fetchMock, getConversationTraceRefs } = setup({
        refs: createRefs({ sampledMessages: [] }),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toBe(false);
      expect(getConversationTraceRefs).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is unavailable when no configured destination received the trace', async () => {
      const { reader } = setup({
        refs: createRefs({
          sampledMessages: [{ messageId: 'response-1', langfuseDestinationIds: ['retired-id'] }],
        }),
      });

      await expect(reader.isAvailable(createQuery())).resolves.toBe(false);
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

      await expect(reader.isAvailable(createQuery())).resolves.toBe(true);
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

      await expect(reader.isAvailable(createQuery())).resolves.toBe(false);
      await expect(reader.isAvailable(createQuery())).resolves.toBe(false);

      expect(hasSampledTraceMessage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toContain('no destination with read credentials');
    });

    it('answers from one existence query without loading every response or reading Langfuse', async () => {
      const { reader, fetchMock, getConversationTraceRefs, hasSampledTraceMessage } = setup();

      await expect(reader.isAvailable(createQuery())).resolves.toBe(true);
      expect(hasSampledTraceMessage).toHaveBeenCalledTimes(1);
      expect(getConversationTraceRefs).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('listRecords', () => {
    it('reads the session from the recorded destination with its credentials and window', async () => {
      const { reader, fetchMock } = setup({ responses: [jsonResponse({ data: [], meta: {} })] });

      await expect(reader.listRecords(createQuery())).resolves.toEqual({ records: [] });

      const url = requestedUrl(fetchMock);
      expect(url.origin + url.pathname).toBe(
        'https://tenant.langfuse.test/base/api/public/v2/observations',
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        sessionId: 'convo-1',
        fields: 'core,basic,time,model,usage',
        limit: '1000',
        fromStartTime: '2026-09-12T10:50:00.000Z',
        toStartTime: '2026-09-12T12:10:00.000Z',
      });
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(new Headers(init.headers).get('Authorization')).toBe('Basic tenant');
      expect(new Headers(init.headers).get('X-Gateway')).toBe('token');
      expect(init.redirect).toBe('error');
    });

    it('prefers the tenant connection over central when both hold the trace', async () => {
      const { reader, fetchMock } = setup({
        refs: createRefs({ sampledMessages: [{ messageId: 'response-1' }] }),
        responses: [jsonResponse({ data: [] })],
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
        responses: [jsonResponse({ data: [] })],
      });

      await reader.listRecords(createQuery());

      expect(requestedUrl(fetchMock).origin).toBe('https://central.langfuse.test');
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
      expect(page.nextCursor).toBe('cursor-2');
      expect(requestedUrl(fetchMock, 0).searchParams.get('limit')).toBe('3');
      expect(requestedUrl(fetchMock, 0).searchParams.has('cursor')).toBe(false);
      expect(requestedUrl(fetchMock, 1).searchParams.get('limit')).toBe('1');
      expect(requestedUrl(fetchMock, 1).searchParams.get('cursor')).toBe('cursor-1');
    });

    it('continues from a caller cursor and stops when Langfuse has no more pages', async () => {
      const { reader, fetchMock } = setup({
        responses: [jsonResponse({ data: [observation()], meta: { cursor: null } })],
      });

      const page = await reader.listRecords({ ...createQuery(), cursor: 'cursor-2' });

      expect(page.nextCursor).toBeUndefined();
      expect(requestedUrl(fetchMock).searchParams.get('cursor')).toBe('cursor-2');
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

    it('treats a rejected caller cursor as an invalid request', async () => {
      const { reader } = setup({ responses: [jsonResponse({ message: 'bad cursor' }, 400)] });

      await expect(
        reader.listRecords({ ...createQuery(), cursor: 'tampered' }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
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
      });

      await expect(reader.isAvailable(createQuery())).resolves.toBe(false);
      expect(hasSampledTraceMessage).not.toHaveBeenCalled();
    });
  });
});
