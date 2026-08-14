import { resolveCodeExecutionContext } from './execution';

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
});
