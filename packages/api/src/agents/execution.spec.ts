import winston from 'winston';
import { Writable } from 'node:stream';
import { logger } from '@librechat/data-schemas';
import {
  codeExecutionAuthHeaders,
  codeExecutionHeaders,
  resolveCodeExecutionContext,
} from './execution';

jest.mock('@librechat/agents', () => ({
  Constants: { EXECUTE_CODE: 'execute_code' },
  getCodeBaseURL: jest.fn(() => 'http://code-default.test/v1///'),
}));

describe('resolveCodeExecutionContext', () => {
  const originalStatefulUrl = process.env.LIBRECHAT_CODE_BASEURL_STATEFUL;

  afterEach(() => {
    if (originalStatefulUrl == null) {
      delete process.env.LIBRECHAT_CODE_BASEURL_STATEFUL;
      return;
    }
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = originalStatefulUrl;
  });

  it('uses the AWS-free default profile when stateful sessions are off', () => {
    expect(resolveCodeExecutionContext({ statefulSessions: false })).toEqual({
      baseUrl: 'http://code-default.test/v1',
      codeSessionKey: 'execute_code',
      executionProfile: 'default',
      statefulSessions: false,
    });
  });

  it('fails closed when a stateful agent has no stateful endpoint', () => {
    delete process.env.LIBRECHAT_CODE_BASEURL_STATEFUL;

    expect(() => resolveCodeExecutionContext({ statefulSessions: true, userId: 'user-1' })).toThrow(
      'LIBRECHAT_CODE_BASEURL_STATEFUL is not configured',
    );
  });

  it('fails closed when a stateful agent has no authenticated user', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1/';

    expect(() => resolveCodeExecutionContext({ statefulSessions: true })).toThrow(
      'authenticated user ID',
    );
  });

  it('defaults stateful agents to one environment per authenticated user', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1///';

    expect(resolveCodeExecutionContext({ statefulSessions: true, userId: 'user-1' })).toEqual({
      baseUrl: 'http://code-stateful.test/v1',
      codeSessionKey: 'execute_code:stateful:v2:user:b5729fb0e3ca12e7a61ff6857b99d98e',
      executionProfile: 'stateful',
      runtimeSessionHint: 'v2:user:b5729fb0e3ca12e7a61ff6857b99d98e',
      statefulSessions: true,
    });
  });

  it('supports agent-user and conversation isolation', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1';

    expect(
      resolveCodeExecutionContext({
        statefulSessions: true,
        environment: 'agent-user',
        userId: 'user-1',
        agentId: 'agent-1',
      }),
    ).toEqual(
      expect.objectContaining({
        runtimeSessionHint: 'v2:agent-user:9cf1605ead4951d96f711e1b3db86642',
        codeSessionKey: 'execute_code:stateful:v2:agent-user:9cf1605ead4951d96f711e1b3db86642',
      }),
    );
    expect(
      resolveCodeExecutionContext({
        statefulSessions: true,
        environment: 'conversation',
        userId: 'user-1',
        conversationId: 'conversation-1',
      }),
    ).toEqual(
      expect.objectContaining({
        runtimeSessionHint: 'v2:conversation:ea98cd74d68a59d7c8dd012a62580520',
        codeSessionKey: 'execute_code:stateful:v2:conversation:ea98cd74d68a59d7c8dd012a62580520',
      }),
    );
  });

  it('partitions every stateful environment by authenticated user', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1';

    const first = resolveCodeExecutionContext({ statefulSessions: true, userId: 'user-1' });
    const second = resolveCodeExecutionContext({ statefulSessions: true, userId: 'user-2' });

    expect(first.runtimeSessionHint).not.toBe(second.runtimeSessionHint);
    expect(first.runtimeSessionHint).not.toContain('user-1');
    expect(second.runtimeSessionHint).not.toContain('user-2');
  });

  it('routes an agent to its configured attached environment', () => {
    const context = resolveCodeExecutionContext({
      statefulSessions: true,
      environment: 'agent-user',
      environmentId: 'my-vm',
      environments: [
        {
          id: 'managed',
          name: 'Managed',
          type: 'managed',
          baseURL: 'https://managed.example/v1',
          owner: 'deployment',
        },
        {
          id: 'my-vm',
          name: 'My VM',
          type: 'attached',
          baseURL: 'https://bridge.example/v1/',
          workerId: 'opaque-worker-id',
          owner: 'deployment',
        },
      ],
      userId: 'user-1',
      agentId: 'agent-1',
    });

    expect(context).toEqual(
      expect.objectContaining({
        baseUrl: 'https://bridge.example/v1',
        environmentId: 'my-vm',
        environmentType: 'attached',
        executionProfile: 'stateful',
        bridgeWorkerId: 'opaque-worker-id',
      }),
    );
    expect(context.runtimeSessionHint).toMatch(/^v3:[a-f0-9]{12}:agent-user:/);
    expect(context.executionRouteKey).toMatch(/^stateful:[a-f0-9]{32}$/);
  });

  it('routes a deployment worker declared in pairing metadata', () => {
    const context = resolveCodeExecutionContext({
      statefulSessions: true,
      environmentId: 'deployment-vm',
      environments: [
        {
          id: 'deployment-vm',
          name: 'Deployment VM',
          type: 'attached',
          baseURL: 'https://bridge.example/v1',
          owner: 'deployment',
          pairing: {
            workerId: 'deployment-worker',
            allowPrincipalWorkers: false,
            tokenEnv: 'CODE_ADMIN_TOKEN',
          },
        },
      ],
      userId: 'user-1',
    });

    expect(context.bridgeWorkerId).toBe('deployment-worker');
    expect(codeExecutionHeaders(context)).toMatchObject({
      'X-LibreChat-Code-Worker-ID': 'deployment-worker',
    });
  });

  it('does not execute a pairing-only control plane', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1';
    const environments = [
      {
        id: 'self-service',
        name: 'Self-service',
        type: 'attached' as const,
        baseURL: 'https://bridge.example/v1',
        default: true,
        owner: 'deployment' as const,
        pairing: {
          allowPrincipalWorkers: true,
          tokenEnv: 'CODE_ADMIN_TOKEN',
        },
      },
    ];

    expect(
      resolveCodeExecutionContext({ statefulSessions: true, environments, userId: 'user-1' }),
    ).toEqual(
      expect.objectContaining({
        baseUrl: 'http://code-stateful.test/v1',
        environmentId: undefined,
        bridgeWorkerId: undefined,
      }),
    );
    expect(() =>
      resolveCodeExecutionContext({
        statefulSessions: true,
        environmentId: 'self-service',
        environments,
        userId: 'user-1',
      }),
    ).toThrow('Stateful code environment "self-service" is not configured');
  });

  it('adds the server-selected worker to execution auth without replacing authentication', async () => {
    const context = resolveCodeExecutionContext({
      statefulSessions: true,
      environmentId: 'my-vm',
      environments: [
        {
          id: 'my-vm',
          name: 'My VM',
          type: 'attached',
          baseURL: 'https://bridge.example/v1',
          owner: 'principal',
          workerId: 'opaque-worker-id',
        },
      ],
      userId: 'user-1',
    });

    expect(codeExecutionHeaders(context)).toEqual({
      'X-CodeAPI-Expected-Profile': 'stateful',
      'X-LibreChat-Code-Worker-ID': 'opaque-worker-id',
    });
    const authHeaders = jest.fn(async (workerId?: string) => ({
      Authorization: `Bearer user-token-for-${workerId ?? 'default'}`,
    }));
    await expect(codeExecutionAuthHeaders(authHeaders, context)).resolves.toEqual({
      Authorization: 'Bearer user-token-for-opaque-worker-id',
      'X-CodeAPI-Expected-Profile': 'stateful',
      'X-LibreChat-Code-Worker-ID': 'opaque-worker-id',
    });
    expect(authHeaders).toHaveBeenCalledWith('opaque-worker-id');
  });

  it('namespaces configured deployments independently of the shared wire profile', () => {
    const environment = (id: string, baseURL: string) => ({
      id,
      name: id,
      type: 'attached' as const,
      baseURL,
      default: true,
      owner: 'deployment' as const,
    });
    const first = resolveCodeExecutionContext({
      statefulSessions: true,
      environments: [environment('first', 'https://first.example/v1')],
      userId: 'user-1',
    });
    const replacement = resolveCodeExecutionContext({
      statefulSessions: true,
      environments: [environment('first', 'https://replacement.example/v1')],
      userId: 'user-1',
    });

    expect(first.executionProfile).toBe('stateful');
    expect(replacement.executionProfile).toBe('stateful');
    expect(first.runtimeSessionHint).toBe(replacement.runtimeSessionHint);
    expect(first.executionRouteKey).not.toBe(replacement.executionRouteKey);
    expect(first.codeSessionKey).not.toBe(replacement.codeSessionKey);
  });

  it('namespaces replacement workers independently under a stable environment route', () => {
    const environment = (workerId: string) => ({
      id: 'personal-vm',
      name: 'Personal VM',
      type: 'attached' as const,
      baseURL: 'https://bridge.example/v1',
      default: true,
      owner: 'principal' as const,
      workerId,
    });
    const first = resolveCodeExecutionContext({
      statefulSessions: true,
      environments: [environment('worker-a')],
      userId: 'user-1',
    });
    const replacement = resolveCodeExecutionContext({
      statefulSessions: true,
      environments: [environment('worker-b')],
      userId: 'user-1',
    });

    expect(first.runtimeSessionHint).toBe(replacement.runtimeSessionHint);
    expect(first.executionRouteKey).not.toBe(replacement.executionRouteKey);
    expect(first.codeSessionKey).not.toBe(replacement.codeSessionKey);
  });

  it('uses the operator-selected default environment when the agent has no override', () => {
    const context = resolveCodeExecutionContext({
      statefulSessions: true,
      environments: [
        {
          id: 'default-vm',
          name: 'Default VM',
          type: 'attached',
          baseURL: 'https://bridge.example/v1',
          default: true,
          owner: 'deployment',
        },
      ],
      userId: 'user-1',
    });

    expect(context.environmentId).toBe('default-vm');
    expect(context.baseUrl).toBe('https://bridge.example/v1');
  });

  it('fails closed when an agent references an unknown configured environment', () => {
    expect(() =>
      resolveCodeExecutionContext({
        statefulSessions: true,
        environmentId: 'missing-vm',
        environments: [],
        userId: 'user-1',
      }),
    ).toThrow('Stateful code environment "missing-vm" is not configured');
  });
});

describe('codeExecutionAuthHeaders', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs the failure that reaches the model as a generic authorization error', async () => {
    const failure = new Error('code API signing key is not configured');

    await expect(
      codeExecutionAuthHeaders(() => Promise.reject(failure), {
        executionProfile: 'stateful',
        bridgeWorkerId: 'opaque-worker-id',
      }),
    ).rejects.toBe(failure);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[codeExecutionAuthHeaders] Failed to resolve Code API auth headers | Profile: stateful | Worker: opaque-worker-id',
      failure,
    );
  });

  it('renders the cause on a console format that prints only the message', async () => {
    errorSpy.mockRestore();
    const rendered: string[] = [];
    const capture = new winston.transports.Stream({
      stream: new Writable({
        write(chunk: Buffer, _encoding: string, done: () => void) {
          rendered.push(String(chunk));
          done();
        },
      }),
      format: winston.format.printf((info) => `${info.level}: ${info.message}`),
    });
    const existing = [...logger.transports];
    existing.forEach((transport) => {
      transport.silent = true;
    });
    logger.add(capture);

    try {
      await codeExecutionAuthHeaders(
        () => Promise.reject(new Error('code API signing key is not configured')),
        { executionProfile: 'stateful' },
      ).catch(() => undefined);
      await codeExecutionAuthHeaders(() => Promise.reject('signing service unreachable'), {
        executionProfile: 'stateful',
      }).catch(() => undefined);
    } finally {
      logger.remove(capture);
      existing.forEach((transport) => {
        transport.silent = false;
      });
    }

    expect(rendered.join('')).toContain('code API signing key is not configured');
    expect(rendered.join('')).toContain('signing service unreachable');
  });

  it('carries a non-Error rejection in the message, which winston would otherwise drop', async () => {
    await expect(
      codeExecutionAuthHeaders(() => Promise.reject('signing service unreachable'), {
        executionProfile: 'default',
      }),
    ).rejects.toBe('signing service unreachable');

    expect(errorSpy).toHaveBeenCalledWith(
      '[codeExecutionAuthHeaders] Failed to resolve Code API auth headers | Profile: default | Cause: signing service unreachable',
      'signing service unreachable',
    );
  });

  it('omits the worker from the log when the request is not bridged', async () => {
    await expect(
      codeExecutionAuthHeaders(
        () => {
          throw new Error('boom');
        },
        { executionProfile: 'default' },
      ),
    ).rejects.toThrow('boom');

    expect(errorSpy).toHaveBeenCalledWith(
      '[codeExecutionAuthHeaders] Failed to resolve Code API auth headers | Profile: default',
      expect.any(Error),
    );
  });
});
