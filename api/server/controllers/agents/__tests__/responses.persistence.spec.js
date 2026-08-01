/**
 * Regression tests for Open Responses API persistence (`store: true`).
 *
 * These run the controller against a real in-memory MongoDB so the actual
 * `saveMessage`/`saveConvo`/`getMessages` signatures are exercised; only the
 * agent runtime around them is mocked.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Constants } = require('librechat-data-provider');
const { createModels, createMethods } = require('@librechat/data-schemas');

const mockGetAgent = jest.fn();
const mockGetMessages = jest.fn();
const mockGetConvo = jest.fn();
const mockBuildResponse = jest.fn();
/** Ordered log of the calls that must stay ordered relative to each other */
const callOrder = [];
const mockFormatAgentMessages = jest.fn().mockReturnValue({ messages: [], indexTokenCountMap: {} });
const mockGenerateResponseId = jest.fn();
const mockValidateResponseRequest = jest.fn();
const mockConvertInputToMessages = jest.fn();
const mockBuildAggregatedResponse = jest.fn();
const mockSendResponsesErrorResponse = jest.fn();

jest.mock('@librechat/agents', () => ({
  Callback: { TOOL_ERROR: 'TOOL_ERROR' },
  ToolEndHandler: jest.fn(),
  formatAgentMessages: (...args) => mockFormatAgentMessages(...args),
}));

jest.mock('@librechat/api', () => ({
  createRun: jest.fn().mockResolvedValue({ processStream: jest.fn().mockResolvedValue(undefined) }),
  applyContextToAgent: jest.fn().mockResolvedValue(undefined),
  buildToolSet: jest.fn().mockReturnValue(new Set()),
  buildAgentScopedContext: jest.fn().mockResolvedValue(new Map()),
  buildAgentContextAttachmentsByAgentId: jest.fn().mockReturnValue(new Map()),
  scopeSkillIds: jest.fn().mockImplementation((ids) => ids),
  resolveAgentScopedSkillIds: jest
    .fn()
    .mockImplementation(({ accessibleSkillIds }) => accessibleSkillIds),
  loadSkillStates: jest.fn().mockResolvedValue({ skillStates: {}, defaultActiveOnShare: false }),
  createSafeUser: jest.fn().mockReturnValue({ id: 'user-123' }),
  initializeAgent: jest.fn().mockResolvedValue({
    id: 'agent-123',
    model: 'claude-3',
    model_parameters: {},
    toolRegistry: {},
    edges: [],
    agentContextAttachments: [],
  }),
  discoverConnectedAgents: jest.fn().mockResolvedValue({
    agentConfigs: new Map(),
    edges: [],
    skippedAgentIds: new Set(),
    userMCPAuthMap: undefined,
  }),
  getBalanceConfig: jest.fn().mockReturnValue({ enabled: false }),
  getTransactionsConfig: jest.fn().mockReturnValue({ enabled: false }),
  recordCollectedUsage: jest.fn().mockResolvedValue({}),
  createSubagentUsageSink: jest.fn().mockReturnValue(jest.fn()),
  extractManualSkills: jest.fn().mockReturnValue(undefined),
  injectSkillPrimes: jest.fn().mockReturnValue({
    initialMessages: [],
    indexTokenCountMap: {},
    inserted: 0,
    insertIdx: -1,
    alwaysApplyDropped: 0,
    alwaysApplyDedupedFromManual: 0,
  }),
  createToolExecuteHandler: jest.fn().mockReturnValue({ handle: jest.fn() }),
  getRemoteAgentPermissions: jest.fn().mockResolvedValue({}),
  // Responses API
  writeDone: jest.fn(),
  RESPONSE_ID_PREFIX: 'resp_',
  buildResponse: (...args) => mockBuildResponse(...args),
  generateResponseId: (...args) => mockGenerateResponseId(...args),
  isValidationFailure: jest.fn().mockReturnValue(false),
  findPiiMatchInMessages: jest.fn().mockReturnValue(null),
  emitResponseCreated: jest.fn(),
  createResponseContext: jest.fn().mockReturnValue({ responseId: 'resp_1' }),
  createResponseTracker: jest.fn().mockReturnValue({
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
  setupStreamingResponse: jest.fn(),
  emitResponseInProgress: jest.fn(),
  convertInputToMessages: (...args) => mockConvertInputToMessages(...args),
  validateResponseRequest: (...args) => mockValidateResponseRequest(...args),
  buildAggregatedResponse: (...args) => mockBuildAggregatedResponse(...args),
  createResponseAggregator: jest.fn().mockReturnValue({
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
  sendResponsesErrorResponse: (...args) => mockSendResponsesErrorResponse(...args),
  stripActivityLabelParts: jest.fn((payload) => payload),
  createResponsesEventHandlers: jest.fn().mockReturnValue({
    handlers: {},
    closeOpenStreams: () => callOrder.push('closeOpenStreams'),
    completeStream: () => callOrder.push('completeStream'),
    finalizeStream: () => callOrder.push('finalizeStream'),
  }),
  createAggregatorEventHandlers: jest.fn().mockReturnValue({
    on_message_delta: { handle: jest.fn() },
    on_reasoning_delta: { handle: jest.fn() },
    on_run_step: { handle: jest.fn() },
    on_run_step_delta: { handle: jest.fn() },
    on_chat_model_end: { handle: jest.fn() },
  }),
}));

jest.mock('~/server/services/ToolService', () => ({
  loadAgentTools: jest.fn().mockResolvedValue([]),
  loadToolsForExecution: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/controllers/agents/callbacks', () => {
  const noop = { handle: jest.fn() };
  return {
    createToolEndCallback: jest.fn().mockReturnValue(jest.fn()),
    createResponsesToolEndCallback: jest.fn().mockReturnValue(jest.fn()),
    markSummarizationUsage: jest.fn().mockImplementation((usage) => usage),
    agentLogHandlerObj: noop,
    buildSummarizationHandlers: jest.fn().mockReturnValue({
      on_summarize_start: noop,
      on_summarize_delta: noop,
      on_summarize_complete: noop,
    }),
  };
});

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  getEffectivePermissions: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn().mockReturnValue({}),
}));

jest.mock('~/server/services/Endpoints/agents/skillDeps', () => ({
  getSkillToolDeps: jest.fn(() => ({})),
  getSkillDbMethods: jest.fn(() => ({})),
  canAuthorSkillFiles: jest.fn().mockReturnValue(false),
  withDeploymentSkillIds: jest.fn((ids = []) => ids),
  enrichWithSkillConfigurable: jest.fn((result) => result),
  buildSkillPrimedIdsByName: jest.fn(() => undefined),
  buildAgentToolContext: jest.fn(({ agent }) => ({ agent })),
  enrichLoadedToolsWithAgentContext: jest.fn(({ result }) => result),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/models', () => {
  const realMongoose = require('mongoose');
  const { createMethods: create } = require('@librechat/data-schemas');
  const methods = create(realMongoose);
  return {
    ...methods,
    /** Spied so the controller's own history reads can be counted */
    getMessages: (...args) => {
      mockGetMessages(...args);
      return methods.getMessages(...args);
    },
    getConvo: (...args) => {
      mockGetConvo(...args);
      return methods.getConvo(...args);
    },
    saveMessage: (...args) => {
      callOrder.push('saveMessage');
      return methods.saveMessage(...args);
    },
    saveConvo: (...args) => {
      callOrder.push('saveConvo');
      return methods.saveConvo(...args);
    },
    getAgent: (...args) => mockGetAgent(...args),
  };
});

const AGENT_ID = 'agent-123';
const USER_ID = '65f0b1d2a3c4d5e6f7a8b9c0';

describe('Responses API - store: true persistence', () => {
  let mongoServer;
  let controller;
  let db;
  let req;
  let res;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    createModels(mongoose);
    db = createMethods(mongoose);
    controller = require('../responses');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    callOrder.length = 0;
    await mongoose.connection.db.dropDatabase();

    mockGetAgent.mockResolvedValue({ id: AGENT_ID, name: 'Test Agent', model: 'claude-3' });
    mockFormatAgentMessages.mockReturnValue({ messages: [], indexTokenCountMap: {} });

    req = {
      body: {},
      user: { id: USER_ID },
      config: { endpoints: { agents: { allowedProviders: ['anthropic'] } } },
      on: jest.fn(),
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      end: jest.fn(),
      write: jest.fn(),
    };
  });

  /** Drive one non-streaming `store: true` turn through the controller */
  const runTurn = async ({ input, responseId, previousResponseId }) => {
    mockGenerateResponseId.mockReturnValue(responseId);
    mockValidateResponseRequest.mockReturnValue({
      request: {
        model: AGENT_ID,
        input,
        store: true,
        stream: false,
        ...(previousResponseId != null ? { previous_response_id: previousResponseId } : {}),
      },
    });
    mockConvertInputToMessages.mockReturnValue([{ role: 'user', content: input }]);
    mockBuildAggregatedResponse.mockReturnValue({
      id: responseId,
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: `answer to ${input}` }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });

    await controller.createResponse(req, res);
  };

  /** Drive one streaming `store: true` turn through the controller */
  const runStreamingTurn = async ({ input, responseId }) => {
    mockGenerateResponseId.mockReturnValue(responseId);
    mockValidateResponseRequest.mockReturnValue({
      request: { model: AGENT_ID, input, store: true, stream: true },
    });
    mockConvertInputToMessages.mockReturnValue([{ role: 'user', content: input }]);
    /** Mirrors the real `buildResponse`, whose text is only materialized once streams close */
    mockBuildResponse.mockImplementation(() => ({
      id: responseId,
      status: callOrder.includes('closeOpenStreams') ? 'completed' : 'in_progress',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: callOrder.includes('closeOpenStreams') ? `answer to ${input}` : '',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }));

    await controller.createResponse(req, res);
  };

  /** The conversation created by the most recent turn */
  const getStoredConversation = async () => {
    const conversations = await mongoose.models.Conversation.find({ user: USER_ID }).lean();
    return conversations[0];
  };

  const getStoredMessages = async (conversationId) =>
    db.getMessages({ conversationId, user: USER_ID });

  it('persists the user and assistant messages', async () => {
    await runTurn({ input: 'hello', responseId: 'resp_1' });

    expect(mockSendResponsesErrorResponse).not.toHaveBeenCalled();

    const conversation = await getStoredConversation();
    expect(conversation).toBeDefined();

    const messages = await getStoredMessages(conversation.conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ isCreatedByUser: true, text: 'hello' });
    expect(messages[1]).toMatchObject({
      isCreatedByUser: false,
      messageId: 'resp_1',
      text: 'answer to hello',
    });
  });

  it('stores the conversation with the schema `agent_id` field', async () => {
    await runTurn({ input: 'hello', responseId: 'resp_1' });

    const conversation = await getStoredConversation();
    expect(conversation.agent_id).toBe(AGENT_ID);
  });

  it('roots the first user message and links the assistant reply to it', async () => {
    await runTurn({ input: 'hello', responseId: 'resp_1' });

    const conversation = await getStoredConversation();
    const [userMessage, assistantMessage] = await getStoredMessages(conversation.conversationId);

    expect(userMessage.parentMessageId).toBe(Constants.NO_PARENT);
    expect(assistantMessage.parentMessageId).toBe(userMessage.messageId);
  });

  it('builds a single-rooted parent chain across two turns', async () => {
    await runTurn({ input: 'first', responseId: 'resp_1' });
    const conversation = await getStoredConversation();
    await runTurn({
      input: 'second',
      responseId: 'resp_2',
      previousResponseId: 'resp_1',
    });

    const messages = await getStoredMessages(conversation.conversationId);
    expect(messages).toHaveLength(4);

    const roots = messages.filter((message) => message.parentMessageId === Constants.NO_PARENT);
    expect(roots).toHaveLength(1);

    const [firstUser, firstAssistant, secondUser, secondAssistant] = messages;
    expect(firstAssistant.parentMessageId).toBe(firstUser.messageId);
    expect(secondUser.parentMessageId).toBe(firstAssistant.messageId);
    expect(secondAssistant.parentMessageId).toBe(secondUser.messageId);
  });

  it('records the turn in the conversation message list', async () => {
    await runTurn({ input: 'first', responseId: 'resp_1' });

    let conversation = await getStoredConversation();
    expect(conversation.messages).toHaveLength(2);

    await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

    conversation = await getStoredConversation();
    expect(conversation.messages).toHaveLength(4);
  });

  it('parents a branch to the referenced response rather than the conversation tip', async () => {
    await runTurn({ input: 'first', responseId: 'resp_1' });
    const { conversationId } = await getStoredConversation();
    await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

    await runTurn({ input: 'branch', responseId: 'resp_3', previousResponseId: 'resp_1' });

    const messages = await getStoredMessages(conversationId);
    const branchUser = messages.find((message) => message.text === 'branch');
    expect(branchUser.parentMessageId).toBe('resp_1');
    expect(messages.find((message) => message.messageId === 'resp_3').parentMessageId).toBe(
      branchUser.messageId,
    );
  });

  describe('streaming', () => {
    it('persists the response before emitting the terminal stream event', async () => {
      await runStreamingTurn({ input: 'hello', responseId: 'resp_1' });

      expect(callOrder).toEqual([
        'closeOpenStreams',
        'saveMessage',
        'saveMessage',
        'saveConvo',
        'completeStream',
      ]);
    });

    it('persists the streamed text, which is only materialized once streams close', async () => {
      await runStreamingTurn({ input: 'hello', responseId: 'resp_1' });

      const { conversationId } = await getStoredConversation();
      const messages = await getStoredMessages(conversationId);
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ messageId: 'resp_1', text: 'answer to hello' });
    });
  });

  describe('history reads', () => {
    it('reads no history to parent the first turn', async () => {
      await runTurn({ input: 'hello', responseId: 'resp_1' });

      expect(mockGetMessages).not.toHaveBeenCalled();
    });

    it('reads the history once for a continuation', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      mockGetMessages.mockClear();

      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

      expect(mockGetMessages).toHaveBeenCalledTimes(1);
    });

    it('skips the guaranteed-miss conversation lookup for a response id', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      mockGetConvo.mockClear();

      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

      expect(mockGetConvo).not.toHaveBeenCalledWith(USER_ID, 'resp_1');
    });
  });

  describe('previous_response_id resolution', () => {
    it('continues the conversation when given a returned response id', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      const { conversationId } = await getStoredConversation();

      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

      expect(mockSendResponsesErrorResponse).not.toHaveBeenCalled();
      const conversations = await mongoose.models.Conversation.find({ user: USER_ID }).lean();
      expect(conversations).toHaveLength(1);
      expect(await getStoredMessages(conversationId)).toHaveLength(4);
    });

    it('continues the conversation when given a conversation id', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      const { conversationId } = await getStoredConversation();

      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: conversationId });

      expect(mockSendResponsesErrorResponse).not.toHaveBeenCalled();
      expect(await getStoredMessages(conversationId)).toHaveLength(4);
    });

    it('loads the prior turn as context using the resolved conversation id', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_1' });

      const [messagesForRun] = mockFormatAgentMessages.mock.calls.at(-1);
      expect(messagesForRun).toEqual([
        { role: 'user', content: 'first', messageId: expect.any(String) },
        { role: 'assistant', content: 'answer to first', messageId: 'resp_1' },
        { role: 'user', content: 'second' },
      ]);
    });

    it('returns 404 for an id that matches no conversation or response', async () => {
      await runTurn({ input: 'first', responseId: 'resp_1' });
      await runTurn({ input: 'second', responseId: 'resp_2', previousResponseId: 'resp_missing' });

      expect(mockSendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        404,
        'Conversation not found',
        'not_found',
      );
    });
  });

  describe('getResponse', () => {
    const getById = async (id) => {
      const getRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      await controller.getResponse({ params: { id }, user: { id: USER_ID } }, getRes);
      return getRes;
    };

    it('retrieves a stored response by its response id', async () => {
      await runTurn({ input: 'hello', responseId: 'resp_1' });

      const getRes = await getById('resp_1');

      expect(mockSendResponsesErrorResponse).not.toHaveBeenCalled();
      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'resp_1',
          model: AGENT_ID,
          output: [
            expect.objectContaining({
              id: 'resp_1',
              role: 'assistant',
              content: [expect.objectContaining({ text: 'answer to hello' })],
            }),
          ],
        }),
      );
    });

    it('retrieves a stored response by its conversation id', async () => {
      await runTurn({ input: 'hello', responseId: 'resp_1' });
      const { conversationId } = await getStoredConversation();

      const getRes = await getById(conversationId);

      expect(mockSendResponsesErrorResponse).not.toHaveBeenCalled();
      expect(getRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: conversationId, model: AGENT_ID }),
      );
    });

    it('returns 404 for an unknown id', async () => {
      await getById('resp_missing');

      expect(mockSendResponsesErrorResponse).toHaveBeenCalledWith(
        expect.anything(),
        404,
        'Response not found: resp_missing',
        'not_found',
        'response_not_found',
      );
    });
  });
});
