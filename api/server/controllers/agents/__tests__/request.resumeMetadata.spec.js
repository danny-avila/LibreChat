const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const mockGenerationJobManager = {
  createJob: jest.fn(),
  emitError: jest.fn(),
  completeJob: jest.fn(),
  getResumeState: jest.fn(),
  updateMetadata: jest.fn(),
};

const mockCheckAndIncrementPendingRequest = jest.fn();
const mockDecrementPendingRequest = jest.fn();
const mockFilterPersistableAbortContent = jest.fn((content) =>
  content.filter((part) => part?.type !== 'tool_call'),
);
const mockGetConvo = jest.fn();
const mockSaveMessage = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  getViolationInfo: jest.fn(),
  buildMessageFiles: jest.fn(() => []),
  resolveTitleTiming: jest.fn(() => 'immediate'),
  GenerationJobManager: mockGenerationJobManager,
  filterPersistableAbortContent: (...args) => mockFilterPersistableAbortContent(...args),
  decrementPendingRequest: (...args) => mockDecrementPendingRequest(...args),
  sanitizeMessageForTransmit: jest.fn((message) => message),
  checkAndIncrementPendingRequest: (...args) => mockCheckAndIncrementPendingRequest(...args),
}));

jest.mock('~/server/cleanup', () => ({
  disposeClient: jest.fn(),
  clientRegistry: null,
  requestDataMap: {
    set: jest.fn(),
  },
}));

jest.mock('~/server/middleware', () => ({
  handleAbortError: jest.fn(() => Promise.resolve()),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/models', () => ({
  saveMessage: (...args) => mockSaveMessage(...args),
  getConvo: (...args) => mockGetConvo(...args),
}));

const AgentController = require('../request');

describe('ResumableAgentController resume metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckAndIncrementPendingRequest.mockResolvedValue({ allowed: true });
    mockDecrementPendingRequest.mockResolvedValue(undefined);
    mockGetConvo.mockResolvedValue({ createdAt: '2026-06-07T00:00:00.000Z' });
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: { on: jest.fn() },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue(null);
    mockGenerationJobManager.updateMetadata.mockResolvedValue(undefined);
    mockGenerationJobManager.emitError.mockResolvedValue(undefined);
    mockSaveMessage.mockResolvedValue({});
  });

  it('stores the in-flight turn before MCP initialization can emit OAuth', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Check Google Workspace availability.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          iconURL: 'https://example.com/spec-icon.png',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        conversationId,
        endpoint: 'agents',
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-3.5-turbo',
        responseMessageId: 'follow-up-user_',
        userMessage: {
          messageId: 'follow-up-user',
          parentMessageId: 'original-response',
          conversationId,
          text: 'Check Google Workspace availability.',
        },
      }),
    );
    expect(mockGenerationJobManager.updateMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      initializeClient.mock.invocationCallOrder[0],
    );
  });

  it('stores model spec icon fallbacks and agent ids in early resume metadata', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use the resume spec.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'agent-spec',
          agent_id: 'agent_resume_spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'agent-spec',
              preset: {
                endpoint: 'openAI',
                iconURL: 'https://example.com/preset-icon.png',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        iconURL: 'https://example.com/preset-icon.png',
        model: 'agent_resume_spec',
      }),
    );
  });

  it('falls back to the model spec preset endpoint when no icon URL is configured', async () => {
    const conversationId = 'conversation-123';
    const initializeClient = jest.fn().mockRejectedValue(new Error('stop before tool loading'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use the endpoint icon.',
        messageId: 'follow-up-user',
        parentMessageId: 'original-response',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'endpoint-icon-spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'endpoint-icon-spec',
              preset: {
                endpoint: 'anthropic',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);

    expect(mockGenerationJobManager.updateMetadata).toHaveBeenCalledWith(
      conversationId,
      expect.objectContaining({
        iconURL: 'anthropic',
        model: 'gpt-4.1',
      }),
    );
  });

  it('filters OAuth prompts before saving partial responses on disconnect', async () => {
    const conversationId = 'conversation-123';
    let allSubscribersLeftHandler;
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: {
        on: jest.fn((event, handler) => {
          if (event === 'allSubscribersLeft') {
            allSubscribersLeftHandler = handler;
          }
        }),
      },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue({
      conversationId,
      responseMessageId: 'response-message',
      iconURL: 'https://example.com/spec-icon.png',
      model: 'gpt-4.1',
      userMessage: {
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        text: 'Use Google Workspace',
      },
    });

    const initializeClient = jest.fn().mockRejectedValue(new Error('stop after setup'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use Google Workspace',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          iconURL: 'https://example.com/fallback-icon.png',
          modelOptions: { model: 'gpt-3.5-turbo' },
        },
      },
      config: {},
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);
    expect(allSubscribersLeftHandler).toEqual(expect.any(Function));

    const oauthPart = {
      type: 'tool_call',
      tool_call: {
        name: 'oauth_mcp_Google-Workspace',
        auth: 'https://auth.example.com/oauth',
      },
    };
    const textPart = { type: 'text', text: 'Partial response...' };

    await allSubscribersLeftHandler([oauthPart, textPart]);

    expect(mockFilterPersistableAbortContent).toHaveBeenCalledWith([oauthPart, textPart]);
    expect(mockSaveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123' }),
      expect.objectContaining({
        content: [textPart],
        iconURL: 'https://example.com/spec-icon.png',
        model: 'gpt-4.1',
        messageId: 'response-message',
        parentMessageId: 'user-message',
      }),
      expect.any(Object),
    );
  });

  it('uses model spec and agent fallbacks when saving partial responses on disconnect', async () => {
    const conversationId = 'conversation-123';
    let allSubscribersLeftHandler;
    mockGenerationJobManager.createJob.mockResolvedValue({
      createdAt: 1000,
      readyPromise: Promise.resolve(),
      abortController: new AbortController(),
      emitter: {
        on: jest.fn((event, handler) => {
          if (event === 'allSubscribersLeft') {
            allSubscribersLeftHandler = handler;
          }
        }),
      },
    });
    mockGenerationJobManager.getResumeState.mockResolvedValue({
      conversationId,
      responseMessageId: 'response-message',
      userMessage: {
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        text: 'Use fallback metadata',
      },
    });

    const initializeClient = jest.fn().mockRejectedValue(new Error('stop after setup'));
    const req = {
      user: { id: 'user-123' },
      body: {
        text: 'Use fallback metadata',
        messageId: 'user-message',
        parentMessageId: 'parent-message',
        conversationId,
        endpointOption: {
          endpoint: 'agents',
          spec: 'agent-spec',
          agent_id: 'agent_resume_spec',
          model_parameters: { model: 'gpt-4.1' },
        },
      },
      config: {
        modelSpecs: {
          list: [
            {
              name: 'agent-spec',
              preset: {
                endpoint: 'openAI',
                iconURL: 'https://example.com/preset-icon.png',
              },
            },
          ],
        },
      },
    };
    const res = {
      headersSent: true,
      json: jest.fn(() => {
        res.headersSent = true;
      }),
      status: jest.fn(() => res),
    };

    await AgentController(req, res, jest.fn(), initializeClient, null);
    expect(allSubscribersLeftHandler).toEqual(expect.any(Function));

    const textPart = { type: 'text', text: 'Partial response...' };
    await allSubscribersLeftHandler([textPart]);

    expect(mockSaveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123' }),
      expect.objectContaining({
        content: [textPart],
        iconURL: 'https://example.com/preset-icon.png',
        model: 'agent_resume_spec',
        messageId: 'response-message',
        parentMessageId: 'user-message',
      }),
      expect.any(Object),
    );
  });
});
