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
    await expect(
      codeExecutionAuthHeaders(async () => ({ Authorization: 'Bearer user-token' }), context),
    ).resolves.toEqual({
      Authorization: 'Bearer user-token',
      'X-CodeAPI-Expected-Profile': 'stateful',
      'X-LibreChat-Code-Worker-ID': 'opaque-worker-id',
    });
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
