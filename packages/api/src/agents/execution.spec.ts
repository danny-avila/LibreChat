import { resolveCodeExecutionContext } from './execution';

jest.mock('@librechat/agents', () => ({
  Constants: { EXECUTE_CODE: 'execute_code' },
  getCodeBaseURL: jest.fn(() => 'http://code-default.test/v1/'),
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

    expect(() => resolveCodeExecutionContext({ statefulSessions: true })).toThrow(
      'LIBRECHAT_CODE_BASEURL_STATEFUL is not configured',
    );
  });

  it('defaults stateful agents to one environment per authenticated user', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1/';

    expect(resolveCodeExecutionContext({ statefulSessions: true })).toEqual({
      baseUrl: 'http://code-stateful.test/v1',
      codeSessionKey: 'execute_code:stateful:v1:user',
      executionProfile: 'stateful',
      runtimeSessionHint: 'v1:user',
      statefulSessions: true,
    });
  });

  it('supports agent-user and conversation isolation', () => {
    process.env.LIBRECHAT_CODE_BASEURL_STATEFUL = 'http://code-stateful.test/v1';

    expect(
      resolveCodeExecutionContext({
        statefulSessions: true,
        environment: 'agent-user',
        agentId: 'agent-1',
      }),
    ).toEqual(
      expect.objectContaining({
        runtimeSessionHint: 'v1:agent-user:agent-1',
        codeSessionKey: 'execute_code:stateful:v1:agent-user:agent-1',
      }),
    );
    expect(
      resolveCodeExecutionContext({
        statefulSessions: true,
        environment: 'conversation',
        conversationId: 'conversation-1',
      }),
    ).toEqual(
      expect.objectContaining({
        runtimeSessionHint: 'v1:conversation:conversation-1',
        codeSessionKey: 'execute_code:stateful:v1:conversation:conversation-1',
      }),
    );
  });
});
