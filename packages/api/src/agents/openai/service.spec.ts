import { createAgentChatCompletion } from './service';
import type { ChatCompletionDependencies } from './service';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

type CreateRunArgs = { user?: Record<string, unknown> };
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

  it('aggregates content and usage for non-streaming responses', async () => {
    createRun.mockImplementation(
      (args: { customHandlers: Record<string, { handle: (e: string, d: unknown) => void }> }) => {
        const handlers = args.customHandlers;
        return Promise.resolve({
          processStream: jest.fn().mockImplementation(() => {
            handlers['on_message_delta'].handle('on_message_delta', {
              content: [{ type: 'text', text: 'Hello ' }],
            });
            handlers['on_message_delta'].handle('on_message_delta', {
              content: [{ type: 'text', text: 'world' }],
            });
            handlers['on_chat_model_end'].handle('on_chat_model_end', {
              output: { usage_metadata: { input_tokens: 3, output_tokens: 5 } },
            });
            return Promise.resolve();
          }),
        });
      },
    );

    const res = createMockRes();
    await createAgentChatCompletion(createMockReq({ id: 'user-123', role: 'USER' }), res, deps);

    const json = (res.json as jest.Mock).mock.calls[0][0] as {
      choices: Array<{ message: { content: string | null } }>;
      usage: { total_tokens: number };
    };
    expect(json.choices[0].message.content).toBe('Hello world');
    expect(json.usage.total_tokens).toBe(8);
  });

  it('forces the non-streaming path for pro reasoning models even when streaming is requested', async () => {
    (deps.initializeAgent as jest.Mock).mockResolvedValue({
      id: 'agent_test',
      provider: 'openai',
      model: 'gpt-5.5-pro',
      tools: [],
      attachments: [],
      toolContextMap: {},
      maxContextTokens: 1000,
      model_parameters: { model: 'gpt-5.5-pro' },
    });

    const req = createMockReq({ id: 'user-123', role: 'USER' });
    (req as unknown as { body: { stream: boolean } }).body.stream = true;
    const res = createMockRes();

    await createAgentChatCompletion(req, res, deps);

    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
