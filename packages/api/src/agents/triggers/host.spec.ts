import { Constants, EModelEndpoint } from 'librechat-data-provider';
import { getRequestId, getTenantId, getUserId } from '@librechat/data-schemas';
import type {
  SteerRequestBody,
  SteerRequestDeps,
  SteerRequestResult,
  SteerRequestUser,
} from '../steering';
import type { AgentTriggerExecutionHostDeps, AgentTriggerFetch } from './host';
import { createAgentTriggerEnvelope, getAgentTriggerIdempotencyKey } from './envelope';
import { AgentTriggerExecutionError, createAgentTriggerExecutionHost } from './host';

const createFireEnvelope = () =>
  createAgentTriggerEnvelope({
    mode: 'fire',
    requestId: 'request-1',
    deliveryId: 'delivery-1',
    receivedAt: 20,
    principal: { id: 'user-1', role: 'member', tenantId: 'tenant-1' },
    target: { agentId: 'agent-1' },
    event: {
      id: 'event-1',
      type: 'resource.ready',
      occurredAt: 10,
      source: { id: 'source-1', type: 'webhook' },
      payload: { resourceId: 'resource-1' },
    },
    input: 'Handle the ready resource.',
  });

const createSteerEnvelope = () =>
  createAgentTriggerEnvelope({
    mode: 'steer',
    requestId: 'request-2',
    deliveryId: 'delivery-2',
    receivedAt: 30,
    principal: { id: 'user-1', role: 'member', tenantId: 'tenant-1' },
    target: {
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      generationCreatedAt: 25,
      preempt: true,
    },
    event: {
      id: 'event-2',
      type: 'opponent.moved',
      occurredAt: 21,
      source: { id: 'game-1', type: 'mcp' },
    },
    input: 'The opponent moved. Take your turn.',
  });

function response(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function fetchMock(implementation: AgentTriggerFetch): jest.MockedFunction<AgentTriggerFetch> {
  return jest.fn(implementation);
}

function deps(
  fetcher: jest.MockedFunction<AgentTriggerFetch>,
  overrides: Partial<AgentTriggerExecutionHostDeps> = {},
): AgentTriggerExecutionHostDeps {
  return {
    getBaseUrl: () => 'http://127.0.0.1:3080',
    mintToken: () => 'signed-token',
    checkAgentAccess: async () => true,
    fetch: fetcher,
    ...overrides,
  };
}

function expectExecutionError(error: unknown, expected: Partial<AgentTriggerExecutionError>): void {
  expect(error).toBeInstanceOf(AgentTriggerExecutionError);
  expect(error).toMatchObject(expected);
}

describe('createAgentTriggerExecutionHost fire adapter', () => {
  it('rejects malformed serialized envelopes through its promise contract', async () => {
    const host = createAgentTriggerExecutionHost(deps(fetchMock(async () => response({}))));
    const malformed = { ...createFireEnvelope() };
    Reflect.deleteProperty(malformed, 'requestId');

    await expect(host.dispatch(malformed)).rejects.toThrow('requestId must be a non-empty string');
  });

  it('starts a new run with stable identity, principal context, and no source coupling', async () => {
    const envelope = createFireEnvelope();
    const idempotencyKey = getAgentTriggerIdempotencyKey(envelope);
    const fetcher = fetchMock(async () =>
      response({
        streamId: 'stream-1',
        conversationId: 'conversation-1',
        generationCreatedAt: 40,
        status: 'started',
      }),
    );
    const mintToken = jest.fn(() => {
      expect(getUserId()).toBe('user-1');
      expect(getTenantId()).toBe('tenant-1');
      expect(getRequestId()).toBe(idempotencyKey);
      return 'signed-token';
    });
    const host = createAgentTriggerExecutionHost(
      deps(fetcher, {
        getBaseUrl: () => 'https://chat.example.test/base/?ignored=true',
        mintToken,
        getTimezone: async () => ' America/New_York ',
      }),
    );

    await expect(host.dispatch(envelope)).resolves.toEqual({
      mode: 'fire',
      streamId: 'stream-1',
      conversationId: 'conversation-1',
      generationCreatedAt: 40,
      status: 'started',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0];
    expect(String(input)).toBe('https://chat.example.test/base/api/agents/chat/agents');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer signed-token');
    expect(headers.get('x-request-id')).toBe(idempotencyKey);
    expect(headers.get('x-librechat-generation-protocol')).toBe('2');
    expect(headers.get('user-agent')).toContain('LibreChat-Agent-Trigger/1');
    expect(JSON.parse(String(init?.body))).toEqual({
      text: envelope.input,
      endpoint: EModelEndpoint.agents,
      agent_id: envelope.target.agentId,
      parentMessageId: Constants.NO_PARENT,
      isContinued: false,
      isRegenerate: false,
      clientRequestId: idempotencyKey,
      generationProtocolVersion: 2,
      timezone: 'America/New_York',
    });
    expect(mintToken).toHaveBeenCalledWith(envelope.principal, envelope);
  });

  it('reuses the same generation identity when an ambiguous delivery is retried', async () => {
    const envelope = createFireEnvelope();
    const fetcher = fetchMock(
      jest
        .fn()
        .mockResolvedValueOnce(
          response({
            streamId: 'stream-1',
            conversationId: 'conversation-1',
            generationCreatedAt: 40,
            status: 'started',
          }),
        )
        .mockResolvedValueOnce(
          response({
            streamId: 'stream-1',
            conversationId: 'conversation-1',
            generationCreatedAt: 40,
            status: 'resumed',
          }),
        ),
    );
    const host = createAgentTriggerExecutionHost(deps(fetcher));

    await host.dispatch(envelope);
    await expect(host.dispatch(envelope)).resolves.toMatchObject({
      status: 'resumed',
      conversationId: 'conversation-1',
    });

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as unknown);
    expect(bodies).toEqual([
      expect.objectContaining({ clientRequestId: getAgentTriggerIdempotencyKey(envelope) }),
      expect.objectContaining({ clientRequestId: getAgentTriggerIdempotencyKey(envelope) }),
    ]);
  });

  it('classifies a server rejection as definite and preserves retry guidance', async () => {
    expect.hasAssertions();
    const fetcher = fetchMock(async () =>
      response(
        { code: 'SERVER_NOT_READY', error: 'Try shortly.' },
        { status: 503, headers: { 'retry-after': '2' } },
      ),
    );
    const host = createAgentTriggerExecutionHost(deps(fetcher));

    await host.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        mode: 'fire',
        certainty: 'definite',
        retryable: true,
        code: 'SERVER_NOT_READY',
        status: 503,
        retryAfter: '2',
      });
    });
  });

  it('does not mark an authorization rejection retryable', async () => {
    expect.hasAssertions();
    const fetcher = fetchMock(async () => response({ code: 'FORBIDDEN' }, { status: 403 }));
    const host = createAgentTriggerExecutionHost(deps(fetcher));

    await host.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'definite',
        retryable: false,
        code: 'FORBIDDEN',
        status: 403,
      });
    });
  });

  it('treats malformed success as ambiguous because the generation may have started', async () => {
    expect.hasAssertions();
    const fetcher = fetchMock(async () => response({ status: 'started' }));
    const host = createAgentTriggerExecutionHost(deps(fetcher));

    await host.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        mode: 'fire',
        certainty: 'ambiguous',
        retryable: true,
        code: 'INVALID_RESPONSE',
        status: 200,
      });
    });
  });

  it('keeps the timeout active while reading the accepted response body', async () => {
    expect.hasAssertions();
    const fetcher = fetchMock(async (_input, init) => {
      const signal = init?.signal;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () =>
          new Promise<string>((_resolve, reject) => {
            const abort = () => reject(new Error('body aborted'));
            if (signal?.aborted === true) {
              abort();
            } else {
              signal?.addEventListener('abort', abort, { once: true });
            }
          }),
      } as Response;
    });
    const host = createAgentTriggerExecutionHost(deps(fetcher, { timeoutMs: 10 }));

    await host.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'ambiguous',
        retryable: true,
        code: 'TIMEOUT',
        status: 200,
      });
    });
  });

  it('rejects invalid host configuration before making a network request', async () => {
    const fetcher = fetchMock(async () => response({}));
    const host = createAgentTriggerExecutionHost(
      deps(fetcher, { getBaseUrl: () => 'file:///tmp/not-http' }),
    );

    await host.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'definite',
        retryable: false,
        code: 'INVALID_BASE_URL',
      });
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('distinguishes pre-connect failures from unknown network outcomes', async () => {
    expect.hasAssertions();
    const refused = new TypeError('fetch failed');
    Object.assign(refused, { cause: { code: 'ECONNREFUSED' } });
    const preconnect = createAgentTriggerExecutionHost(
      deps(fetchMock(async () => Promise.reject(refused))),
    );
    const reset = createAgentTriggerExecutionHost(
      deps(fetchMock(async () => Promise.reject(new TypeError('connection reset')))),
    );

    await preconnect.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'definite',
        retryable: true,
        code: 'NETWORK_ERROR',
      });
    });
    await reset.dispatch(createFireEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'ambiguous',
        retryable: true,
        code: 'NETWORK_ERROR',
      });
    });
  });

  it('does not send when the delivery was already aborted', async () => {
    const fetcher = fetchMock(async () => response({}));
    const host = createAgentTriggerExecutionHost(deps(fetcher));
    const controller = new AbortController();
    controller.abort();

    await host
      .dispatch(createFireEnvelope(), { signal: controller.signal })
      .catch((error: unknown) => {
        expectExecutionError(error, {
          certainty: 'definite',
          retryable: true,
          code: 'ABORTED',
        });
      });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('createAgentTriggerExecutionHost steer adapter', () => {
  it('steers through the guarded v2 receipt path with target and tenant fences', async () => {
    const envelope = createSteerEnvelope();
    const idempotencyKey = getAgentTriggerIdempotencyKey(envelope);
    const checkAgentAccess = jest.fn(async () => {
      expect(getUserId()).toBe('user-1');
      expect(getTenantId()).toBe('tenant-1');
      expect(getRequestId()).toBe(idempotencyKey);
      return true;
    });
    const steer = jest.fn(
      async (
        user: SteerRequestUser,
        body: SteerRequestBody,
        suppliedOptions?: SteerRequestDeps,
      ): Promise<SteerRequestResult> => {
        const options = suppliedOptions ?? {};
        expect(user).toEqual({ id: 'user-1', tenantId: 'tenant-1' });
        expect(body).toEqual({
          conversationId: 'conversation-1',
          generationCreatedAt: 25,
          text: envelope.input,
          clientSteerId: idempotencyKey,
          preempt: true,
        });
        expect(options).toMatchObject({
          generationProtocolVersion: 2,
          requireIdempotentDelivery: true,
        });
        await expect(
          options.checkAgentAccess?.({ agentId: 'agent-1', endpoint: 'agents' }),
        ).resolves.toBe(true);
        return {
          status: 202,
          body: {
            status: 'queued',
            conversationId: 'conversation-1',
            steerId: 'steer-1',
            position: 1,
            preempt: true,
            preemptRevision: 4,
          },
        };
      },
    );
    const host = createAgentTriggerExecutionHost(
      deps(
        fetchMock(async () => response({})),
        {
          checkAgentAccess,
          steer,
        },
      ),
    );

    await expect(host.dispatch(envelope)).resolves.toEqual({
      mode: 'steer',
      status: 'queued',
      conversationId: 'conversation-1',
      steerId: 'steer-1',
      position: 1,
      preempt: true,
      preemptRevision: 4,
    });
    expect(checkAgentAccess).toHaveBeenCalledWith(envelope.principal, 'agent-1');
  });

  it.each([
    [{ agentId: 'agent-other', endpoint: 'agents' }, 'a different agent'],
    [{ agentId: 'agent-1', endpoint: 'openAI' }, 'a non-agent endpoint'],
  ])('fails the access hook for %s (%s)', async (run) => {
    const checkAgentAccess = jest.fn(async () => true);
    const steer = jest.fn(
      async (
        _user: SteerRequestUser,
        _body: SteerRequestBody,
        options?: SteerRequestDeps,
      ): Promise<SteerRequestResult> => {
        const allowed = (await options?.checkAgentAccess?.(run)) === true;
        return {
          status: allowed ? 202 : 403,
          body: allowed
            ? {
                status: 'queued',
                conversationId: 'conversation-1',
                steerId: 'steer-1',
                position: 1,
                preempt: false,
              }
            : { code: 'FORBIDDEN' },
        };
      },
    );
    const host = createAgentTriggerExecutionHost(
      deps(
        fetchMock(async () => response({})),
        {
          checkAgentAccess,
          steer,
        },
      ),
    );

    await host.dispatch(createSteerEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        mode: 'steer',
        certainty: 'definite',
        retryable: false,
        code: 'FORBIDDEN',
        status: 403,
      });
    });
    expect(checkAgentAccess).not.toHaveBeenCalled();
  });

  it('surfaces temporary steer backpressure as a retryable definite rejection', async () => {
    expect.hasAssertions();
    const steer = jest.fn(
      async (): Promise<SteerRequestResult> => ({
        status: 429,
        body: { code: 'STEER_QUEUE_FULL' },
      }),
    );
    const host = createAgentTriggerExecutionHost(
      deps(
        fetchMock(async () => response({})),
        {
          steer,
        },
      ),
    );

    await host.dispatch(createSteerEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        certainty: 'definite',
        retryable: true,
        code: 'STEER_QUEUE_FULL',
        status: 429,
      });
    });
  });

  it('classifies a thrown steer-store error as ambiguous and safe to retry', async () => {
    expect.hasAssertions();
    const steer = jest.fn(async () => Promise.reject(new Error('store unavailable')));
    const host = createAgentTriggerExecutionHost(
      deps(
        fetchMock(async () => response({})),
        {
          steer,
        },
      ),
    );

    await host.dispatch(createSteerEnvelope()).catch((error: unknown) => {
      expectExecutionError(error, {
        mode: 'steer',
        certainty: 'ambiguous',
        retryable: true,
        code: 'STEER_ERROR',
      });
    });
  });
});
