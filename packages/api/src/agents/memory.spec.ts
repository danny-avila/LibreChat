import { Types } from 'mongoose';
import { Run, Providers } from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import {
  processMemory,
  createMemoryTool,
  createDeleteMemoryTool,
  getRequestMemories,
  invalidateRequestMemories,
  agentHasInlineMemoryTools,
} from './memory';

jest.mock('~/stream/GenerationJobManager');

const mockCreateSafeUser = jest.fn((user) => ({
  id: user?.id,
  email: user?.email,
  name: user?.name,
  username: user?.username,
}));

const mockResolveHeaders = jest.fn((opts) => {
  const headers = opts.headers || {};
  const user = opts.user || {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    let resolved = value as string;
    resolved = resolved.replace(/\$\{(\w+)\}/g, (_match, envVar) => process.env[envVar] || '');
    resolved = resolved.replace(/\{\{LIBRECHAT_USER_EMAIL\}\}/g, user.email || '');
    resolved = resolved.replace(/\{\{LIBRECHAT_USER_ID\}\}/g, user.id || '');
    result[key] = resolved;
  }
  return result;
});

type HeaderCarrier = { defaultHeaders?: Record<string, string> };
const mockResolveConfigHeaders = jest.fn(
  (opts: {
    llmConfig?: { configuration?: HeaderCarrier; clientOptions?: HeaderCarrier };
    user?: { id?: string; email?: string };
  }) => {
    const cfg = opts?.llmConfig;
    if (cfg?.configuration?.defaultHeaders != null) {
      cfg.configuration.defaultHeaders = mockResolveHeaders({
        headers: cfg.configuration.defaultHeaders,
        user: opts.user,
      });
    }
    if (cfg?.clientOptions?.defaultHeaders != null) {
      cfg.clientOptions.defaultHeaders = mockResolveHeaders({
        headers: cfg.clientOptions.defaultHeaders,
        user: opts.user,
      });
    }
  },
);

jest.mock('~/utils', () => ({
  Tokenizer: {
    getTokenCount: jest.fn(() => 10),
  },
  createSafeUser: (user: unknown) => mockCreateSafeUser(user),
  resolveConfigHeaders: (opts: unknown) => mockResolveConfigHeaders(opts as never),
}));

const { createSafeUser } = jest.requireMock('~/utils');

jest.mock('@librechat/agents', () => {
  const actual = jest.requireActual('@librechat/agents');
  return {
    Run: {
      create: jest.fn(() => ({
        processStream: jest.fn(() => Promise.resolve('success')),
      })),
    },
    Providers: actual.Providers,
    GraphEvents: actual.GraphEvents,
  };
});

function createTestUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    id: new Types.ObjectId().toString(),
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.png',
    provider: 'email',
    role: 'user',
    createdAt: new Date('2021-01-01'),
    updatedAt: new Date('2021-01-01'),
    emailVerified: true,
    ...overrides,
  } as IUser;
}

describe('Memory Agent Header Resolution', () => {
  let testUser: IUser;
  let mockRes: Response;
  let mockMemoryMethods: {
    setMemory: jest.Mock;
    deleteMemory: jest.Mock;
    getFormattedMemories: jest.Mock;
  };

  beforeEach(() => {
    process.env.CUSTOM_API_KEY = 'sk-custom-test-key';
    process.env.TEST_CUSTOM_API_KEY = 'sk-custom-test-key';

    testUser = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
    });

    mockRes = {
      write: jest.fn(),
      end: jest.fn(),
      headersSent: false,
    } as unknown as Response;

    mockMemoryMethods = {
      setMemory: jest.fn(),
      deleteMemory: jest.fn(),
      getFormattedMemories: jest.fn(() =>
        Promise.resolve({
          withKeys: 'formatted memories',
          withoutKeys: 'memories without keys',
          totalTokens: 100,
        }),
      ),
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.CUSTOM_API_KEY;
    delete process.env.TEST_CUSTOM_API_KEY;
  });

  it('should resolve environment variables in custom endpoint headers', async () => {
    const llmConfig = {
      provider: 'custom',
      model: 'gpt-4o-mini',
      configuration: {
        defaultHeaders: {
          'x-custom-api-key': '${CUSTOM_API_KEY}',
          'api-key': '${TEST_CUSTOM_API_KEY}',
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];
    expect(runConfig.graphConfig.llmConfig.configuration.defaultHeaders).toEqual({
      'x-custom-api-key': 'sk-custom-test-key',
      'api-key': 'sk-custom-test-key',
    });
  });

  it('should resolve user placeholders in custom endpoint headers', async () => {
    const llmConfig = {
      provider: 'custom',
      model: 'gpt-4o-mini',
      configuration: {
        defaultHeaders: {
          'X-User-Identifier': '{{LIBRECHAT_USER_EMAIL}}',
          'X-User-ID': '{{LIBRECHAT_USER_ID}}',
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];
    expect(runConfig.graphConfig.llmConfig.configuration.defaultHeaders).toEqual({
      'X-User-Identifier': 'test@example.com',
      'X-User-ID': 'user-123',
    });
  });

  it('should handle mixed environment variables and user placeholders', async () => {
    const llmConfig = {
      provider: 'custom',
      model: 'gpt-4o-mini',
      configuration: {
        defaultHeaders: {
          'x-custom-api-key': '${CUSTOM_API_KEY}',
          'X-User-Identifier': '{{LIBRECHAT_USER_EMAIL}}',
          'X-Application-Identifier': 'LibreChat - Test',
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];
    expect(runConfig.graphConfig.llmConfig.configuration.defaultHeaders).toEqual({
      'x-custom-api-key': 'sk-custom-test-key',
      'X-User-Identifier': 'test@example.com',
      'X-Application-Identifier': 'LibreChat - Test',
    });
  });

  it('should resolve env vars when user is undefined', async () => {
    const llmConfig = {
      provider: 'custom',
      model: 'gpt-4o-mini',
      configuration: {
        defaultHeaders: {
          'x-custom-api-key': '${CUSTOM_API_KEY}',
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: undefined,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];
    expect(runConfig.graphConfig.llmConfig.configuration.defaultHeaders).toEqual({
      'x-custom-api-key': 'sk-custom-test-key',
    });
  });

  it('should not throw when llmConfig has no configuration', async () => {
    const llmConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4o-mini',
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];
    expect(runConfig.graphConfig.llmConfig.configuration).toBeUndefined();
  });

  it('should use createSafeUser to sanitize user data', async () => {
    const userWithSensitiveData = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
      password: 'sensitive-password',
      refreshToken: 'sensitive-token',
    } as unknown as Partial<IUser>);

    const llmConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4o-mini',
      configuration: {
        defaultHeaders: {
          'X-User-ID': '{{LIBRECHAT_USER_ID}}',
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'test memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: userWithSensitiveData,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();

    // Verify createSafeUser was used - the user object passed to Run.create should not have sensitive fields
    const safeUser = createSafeUser(userWithSensitiveData);
    expect(safeUser).not.toHaveProperty('password');
    expect(safeUser).not.toHaveProperty('refreshToken');
    expect(safeUser).toHaveProperty('id');
    expect(safeUser).toHaveProperty('email');
  });

  it('should include instructions in user message for Bedrock provider', async () => {
    const llmConfig = {
      provider: Providers.BEDROCK,
      model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    };

    const { HumanMessage } = await import('@librechat/agents/langchain/messages');
    const testMessage = new HumanMessage('test chat content');

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [testMessage],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    // For Bedrock, instructions should NOT be passed to graphConfig
    expect(runConfig.graphConfig.instructions).toBeUndefined();
    expect(runConfig.graphConfig.additional_instructions).toBeUndefined();
  });

  it('should pass instructions to graphConfig for non-Bedrock providers', async () => {
    const llmConfig = {
      provider: Providers.OPENAI,
      model: 'gpt-4o-mini',
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    // For non-Bedrock providers, instructions should be passed to graphConfig
    expect(runConfig.graphConfig.instructions).toBe('test instructions');
    expect(runConfig.graphConfig.additional_instructions).toBeDefined();
  });

  it('should set temperature to 1 for Bedrock with thinking enabled', async () => {
    const llmConfig = {
      provider: Providers.BEDROCK,
      model: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
      temperature: 0.7,
      additionalModelRequestFields: {
        thinking: {
          type: 'enabled',
          budget_tokens: 5000,
        },
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    expect(runConfig.graphConfig.llmConfig.temperature).toBe(1);
  });

  it('should not modify temperature for Bedrock without thinking enabled', async () => {
    const llmConfig = {
      provider: Providers.BEDROCK,
      model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      temperature: 0.7,
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    expect(runConfig.graphConfig.llmConfig.temperature).toBe(0.7);
  });

  it('should remove temperature for Anthropic with thinking enabled', async () => {
    const llmConfig = {
      provider: Providers.ANTHROPIC,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      thinking: {
        type: 'enabled',
        budget_tokens: 5000,
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    expect(runConfig.graphConfig.llmConfig.temperature).toBeUndefined();
    expect(runConfig.graphConfig.llmConfig.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 5000,
    });
  });

  it('should not modify temperature for Anthropic without thinking enabled', async () => {
    const llmConfig = {
      provider: Providers.ANTHROPIC,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    expect(runConfig.graphConfig.llmConfig.temperature).toBe(0.7);
  });

  it('should not modify temperature for Anthropic with thinking type not enabled', async () => {
    const llmConfig = {
      provider: Providers.ANTHROPIC,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.7,
      thinking: {
        type: 'disabled',
      },
    };

    await processMemory({
      res: mockRes,
      userId: 'user-123',
      setMemory: mockMemoryMethods.setMemory,
      deleteMemory: mockMemoryMethods.deleteMemory,
      messages: [],
      memory: 'existing memory',
      messageId: 'msg-123',
      conversationId: 'conv-123',
      validKeys: ['preferences'],
      instructions: 'test instructions',
      llmConfig,
      user: testUser,
    });

    expect(Run.create as jest.Mock).toHaveBeenCalled();
    const runConfig = (Run.create as jest.Mock).mock.calls[0][0];

    expect(runConfig.graphConfig.llmConfig.temperature).toBe(0.7);
  });
});

describe('createMemoryTool tokenLimit enforcement', () => {
  it('serializes parallel set_memory calls so they cannot collectively exceed tokenLimit', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    /** ~100 tokens; two of these (≈200) exceed the 150 limit, but each fits alone. */
    const value = 'word '.repeat(100).trim();
    const tool = createMemoryTool({
      userId: 'user-1',
      setMemory,
      tokenLimit: 150,
      totalTokens: 0,
    });

    await Promise.all([tool.invoke({ key: 'k1', value }), tool.invoke({ key: 'k2', value })]);

    /** Only the first write is committed; the second is rejected against the
     *  updated running total instead of the stale construction-time total. */
    expect(setMemory).toHaveBeenCalledTimes(1);
  });

  it('allows sequential writes that each fit within the remaining capacity', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    const value = 'word '.repeat(10).trim();
    const tool = createMemoryTool({
      userId: 'user-1',
      setMemory,
      tokenLimit: 1000,
      totalTokens: 0,
    });

    await tool.invoke({ key: 'k1', value });
    await tool.invoke({ key: 'k2', value });

    expect(setMemory).toHaveBeenCalledTimes(2);
  });

  it('rejects values longer than charLimit without writing', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    const tool = createMemoryTool({ userId: 'user-1', setMemory, charLimit: 10 });

    await tool.invoke({ key: 'k1', value: 'this value is far longer than ten characters' });

    expect(setMemory).not.toHaveBeenCalled();
  });

  it('treats a repeat write to the same key as a replacement, not an addition', async () => {
    const setMemory = jest.fn().mockResolvedValue({ ok: true });
    /** ~100 tokens; two distinct keys would exceed the 150 limit, but rewriting
     *  the same key only replaces its value and must stay within the cap. */
    const value = 'word '.repeat(100).trim();
    const tool = createMemoryTool({
      userId: 'user-1',
      setMemory,
      tokenLimit: 150,
      totalTokens: 0,
    });

    await tool.invoke({ key: 'k1', value });
    await tool.invoke({ key: 'k1', value });

    expect(setMemory).toHaveBeenCalledTimes(2);
  });

  it('fires onWrite after a successful set, but not when the write fails', async () => {
    const onWrite = jest.fn();
    const okTool = createMemoryTool({
      userId: 'user-1',
      setMemory: jest.fn().mockResolvedValue({ ok: true }),
      onWrite,
    });
    await okTool.invoke({ key: 'k1', value: 'a fact' });
    expect(onWrite).toHaveBeenCalledTimes(1);

    onWrite.mockClear();
    const failTool = createMemoryTool({
      userId: 'user-1',
      setMemory: jest.fn().mockResolvedValue({ ok: false }),
      onWrite,
    });
    await failTool.invoke({ key: 'k1', value: 'a fact' });
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('fires onWrite after a successful delete', async () => {
    const onWrite = jest.fn();
    const tool = createDeleteMemoryTool({
      userId: 'user-1',
      deleteMemory: jest.fn().mockResolvedValue({ ok: true }),
      onWrite,
    });

    await tool.invoke({ key: 'k1' });

    expect(onWrite).toHaveBeenCalledTimes(1);
  });
});

describe('agentHasInlineMemoryTools', () => {
  it('returns false for a nullish agent', () => {
    expect(agentHasInlineMemoryTools(null)).toBe(false);
    expect(agentHasInlineMemoryTools(undefined)).toBe(false);
  });

  it('honors an explicit memoryToolsRegistered flag over the raw marker', () => {
    /** Initialized config whose registration was denied (memoryAvailable false)
     *  but whose raw `memory` marker survived in tools must not be treated as
     *  memory-enabled. */
    expect(agentHasInlineMemoryTools({ memoryToolsRegistered: false, tools: ['memory'] })).toBe(
      false,
    );
    expect(agentHasInlineMemoryTools({ memoryToolsRegistered: true, tools: [] })).toBe(true);
  });

  it('falls back to the raw memory marker when no flag is present', () => {
    expect(agentHasInlineMemoryTools({ tools: ['memory'] })).toBe(true);
    expect(agentHasInlineMemoryTools({ tools: [{ name: 'memory' }] })).toBe(true);
    expect(agentHasInlineMemoryTools({ tools: ['execute_code'] })).toBe(false);
    expect(agentHasInlineMemoryTools({ tools: [] })).toBe(false);
  });
});

describe('getRequestMemories caching', () => {
  it('memoizes per request, then re-fetches after invalidation', async () => {
    const getFormattedMemories = jest
      .fn()
      .mockResolvedValue({ withKeys: '', withoutKeys: '', totalTokens: 10 });
    const req = {};

    await getRequestMemories({ req, userId: 'user-1', getFormattedMemories });
    await getRequestMemories({ req, userId: 'user-1', getFormattedMemories });
    /** A second memory-enabled agent in the same run reuses the first fetch. */
    expect(getFormattedMemories).toHaveBeenCalledTimes(1);

    /** A successful inline write invalidates the cache so a later tool round in
     *  the same response re-reads the post-write usage total. */
    invalidateRequestMemories(req);
    await getRequestMemories({ req, userId: 'user-1', getFormattedMemories });
    expect(getFormattedMemories).toHaveBeenCalledTimes(2);
  });
});
