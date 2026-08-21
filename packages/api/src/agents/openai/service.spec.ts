import { GraphEvents } from '@librechat/agents';
import { ErrorTypes } from 'librechat-data-provider';
import type { ChatCompletionDependencies } from './service';
import { createAgentChatCompletion } from './service';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

type CreateRunArgs = {
  user?: Record<string, unknown>;
  tenantId?: string;
  appConfig?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
};
type ProcessStreamConfig = { configurable?: Record<string, unknown> };

function createMockReq(user?: Record<string, unknown>) {
  return {
    body: {
      model: 'agent_test',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    },
    user,
    on: jest.fn(),
  } as unknown as Parameters<typeof createAgentChatCompletion>[0];
}

function createMockRes() {
  const res: Record<string, unknown> = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false,
  };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res as unknown as Parameters<typeof createAgentChatCompletion>[1];
}

describe('createAgentChatCompletion - MCP permission user propagation', () => {
  let createRun: jest.Mock;
  let processStream: jest.Mock;
  let deps: ChatCompletionDependencies;

  beforeEach(() => {
    processStream = jest.fn().mockResolvedValue(undefined);
    createRun = jest.fn().mockResolvedValue({ processStream });

    deps = {
      getAgent: jest.fn().mockResolvedValue({
        id: 'agent_test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tools: [],
      }),
      initializeAgent: jest.fn().mockResolvedValue({
        id: 'agent_test',
        provider: 'openai',
        model: 'gpt-4o-mini',
        tools: [],
        attachments: [],
        toolContextMap: {},
        maxContextTokens: 1000,
        model_parameters: {},
      }),
      createRun: createRun as unknown as ChatCompletionDependencies['createRun'],
    };
  });

  it('forwards the role-bearing safe user to createRun and configurable.user', async () => {
    const req = createMockReq({
      id: 'user-123',
      role: 'ADMIN',
      email: 'admin@example.com',
      password: 'secret',
    });

    await createAgentChatCompletion(req, createMockRes(), deps);

    expect(createRun).toHaveBeenCalledTimes(1);
    const runArgs = createRun.mock.calls[0][0] as CreateRunArgs;
    expect(runArgs.user).toMatchObject({ id: 'user-123', role: 'ADMIN' });
    // createSafeUser must strip sensitive fields.
    expect(runArgs.user).not.toHaveProperty('password');

    expect(processStream).toHaveBeenCalledTimes(1);
    const streamConfig = processStream.mock.calls[0][1] as ProcessStreamConfig;
    expect(streamConfig.configurable?.user).toMatchObject({ id: 'user-123', role: 'ADMIN' });
    expect(streamConfig.configurable?.user_id).toBe('user-123');
  });

  it('falls back to a bare id when no authenticated user is attached', async () => {
    const req = createMockReq(undefined);

    await createAgentChatCompletion(req, createMockRes(), deps);

    expect(createRun).toHaveBeenCalledTimes(1);
    const runArgs = createRun.mock.calls[0][0] as CreateRunArgs;
    expect(runArgs.user).toEqual({ id: 'api-user' });

    const streamConfig = processStream.mock.calls[0][1] as ProcessStreamConfig;
    // No role present → the runtime MCP check fails closed.
    expect(streamConfig.configurable?.user).toEqual({ id: 'api-user' });
    expect(streamConfig.configurable?.user).not.toHaveProperty('role');
  });

  it('threads the parent message id into the run and execution context', async () => {
    const req = createMockReq({ id: 'user-123', role: 'USER' }) as unknown as {
      body: Record<string, unknown>;
    };
    req.body.parent_message_id = 'parent-123';

    await createAgentChatCompletion(req as never, createMockRes(), deps);

    expect(deps.initializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ parentMessageId: 'parent-123' }),
      }),
    );
    const runArgs = createRun.mock.calls[0][0] as CreateRunArgs;
    expect(runArgs.requestBody).toEqual(expect.objectContaining({ parentMessageId: 'parent-123' }));
    const streamConfig = processStream.mock.calls[0][1] as ProcessStreamConfig;
    expect(streamConfig.configurable?.requestBody).toEqual(runArgs.requestBody);
  });

  it('forwards the normalized MCP body to deferred execution loaders', async () => {
    const req = createMockReq({ id: 'user-123', role: 'USER' }) as unknown as {
      body: Record<string, unknown>;
    };
    req.body.stream = true;
    req.body.parent_message_id = 'parent-123';
    const loadTools = jest.fn().mockResolvedValue({ loadedTools: [] });
    deps.toolExecuteOptions = { loadTools };

    await createAgentChatCompletion(req as never, createMockRes(), deps);

    const runArgs = createRun.mock.calls[0][0] as CreateRunArgs & {
      customHandlers: Record<string, { handle: (event: string, data: unknown) => Promise<void> }>;
    };
    const streamConfig = processStream.mock.calls[0][1] as ProcessStreamConfig;
    const resolve = jest.fn();
    const reject = jest.fn();
    await runArgs.customHandlers[GraphEvents.ON_TOOL_EXECUTE].handle(GraphEvents.ON_TOOL_EXECUTE, {
      toolCalls: [{ id: 'tool-call-1', name: 'deferred_mcp_tool', args: {} }],
      agentId: 'agent_test',
      configurable: streamConfig.configurable,
      metadata: {},
      resolve,
      reject,
    });

    expect(loadTools).toHaveBeenCalledWith(
      ['deferred_mcp_tool'],
      'agent_test',
      expect.objectContaining({ requestBody: runArgs.requestBody }),
    );
  });

  it('uses the root parent sentinel when chat completions omit a parent id', async () => {
    const req = createMockReq({ id: 'user-123', role: 'USER' });

    await createAgentChatCompletion(req, createMockRes(), deps);

    expect(deps.initializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          parentMessageId: '00000000-0000-0000-0000-000000000000',
        }),
      }),
    );
  });

  it('omits an unavailable parent for an existing chat-completions conversation', async () => {
    const req = createMockReq({ id: 'user-123', role: 'USER' }) as unknown as {
      body: Record<string, unknown>;
    };
    req.body.conversation_id = 'conversation-123';

    await createAgentChatCompletion(req as never, createMockRes(), deps);

    const requestBody = (deps.initializeAgent as jest.Mock).mock.calls[0][0].requestBody;
    expect(requestBody).toEqual({
      messageId: expect.any(String),
      conversationId: 'conversation-123',
    });
    expect(requestBody).not.toHaveProperty('parentMessageId');
  });

  it('forwards appConfig and tenantId to createRun', async () => {
    const appConfig = {
      endpoints: {
        agents: { capabilities: ['execute_code'] },
      },
      langfuse: {
        publicKey: 'pk-tenant-1',
        secretKey: 'sk-tenant-1',
      },
      interfaceConfig: {
        modelSelect: true,
      },
    };
    deps.appConfig = appConfig as never;
    const req = createMockReq({
      id: 'user-123',
      tenantId: 'tenant-1',
      role: 'USER',
    });

    await createAgentChatCompletion(req, createMockRes(), deps);

    expect(createRun).toHaveBeenCalledTimes(1);
    const runArgs = createRun.mock.calls[0][0] as CreateRunArgs;
    expect(runArgs.tenantId).toBe('tenant-1');
    expect(runArgs.appConfig).toEqual({
      endpoints: appConfig.endpoints,
      langfuse: appConfig.langfuse,
    });
    expect(runArgs.appConfig).not.toHaveProperty('interfaceConfig');
  });

  it('forwards the stateful environment allowlist from appConfig to agent initialization', async () => {
    deps.appConfig = {
      endpoints: {
        agents: {
          capabilities: ['execute_code', 'stateful_code_sessions'],
          statefulCodeSessions: { allowedEnvironments: ['user', 'agent-user'] },
        },
      },
    } as never;

    await createAgentChatCompletion(createMockReq({ id: 'user-123' }), createMockRes(), deps);

    expect(deps.initializeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        codeEnvAvailable: true,
        statefulSessionsAvailable: true,
        allowedStatefulCodeEnvironments: ['user', 'agent-user'],
      }),
    );
  });

  it('preserves stateful scope policy status and code in an initialization error response', async () => {
    const policyError = Object.assign(
      new Error('Stateful code environment is not allowed by this deployment: conversation'),
      {
        code: ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
        status: 403,
        statusCode: 403,
      },
    );
    (deps.initializeAgent as jest.Mock).mockRejectedValueOnce(policyError);
    const res = createMockRes();

    await createAgentChatCompletion(createMockReq({ id: 'user-123' }), res, deps);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: policyError.message,
        type: 'invalid_request_error',
        param: null,
        code: ErrorTypes.STATEFUL_CODE_ENVIRONMENT_NOT_ALLOWED,
      },
    });
  });
});
