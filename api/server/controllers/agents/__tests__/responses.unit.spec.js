/**
 * Unit tests for Open Responses API controller
 * Tests that recordCollectedUsage is called correctly for token spending
 */

const mockSpendTokens = jest.fn().mockResolvedValue({});
const mockSpendStructuredTokens = jest.fn().mockResolvedValue({});
const mockRecordCollectedUsage = jest
  .fn()
  .mockResolvedValue({ input_tokens: 100, output_tokens: 50 });
const mockGetBalanceConfig = jest.fn().mockReturnValue({ enabled: true });
const mockGetTransactionsConfig = jest.fn().mockReturnValue({ enabled: true });

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'mock-nanoid-123'),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-456'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@librechat/agents', () => ({
  Callback: { TOOL_ERROR: 'TOOL_ERROR' },
  ToolEndHandler: jest.fn(),
  formatAgentMessages: jest.fn().mockReturnValue({
    messages: [],
    indexTokenCountMap: {},
  }),
}));

jest.mock('@librechat/api', () => ({
  createRun: jest.fn().mockResolvedValue({
    processStream: jest.fn().mockResolvedValue(undefined),
  }),
  buildToolSet: jest.fn().mockReturnValue(new Set()),
  createSafeUser: jest.fn().mockReturnValue({ id: 'user-123' }),
  initializeAgent: jest.fn().mockResolvedValue({
    model: 'claude-3',
    model_parameters: {},
    toolRegistry: {},
  }),
  getBalanceConfig: mockGetBalanceConfig,
  getTransactionsConfig: mockGetTransactionsConfig,
  recordCollectedUsage: mockRecordCollectedUsage,
  createToolExecuteHandler: jest.fn().mockReturnValue({ handle: jest.fn() }),
  // Responses API
  writeDone: jest.fn(),
  buildResponse: jest.fn().mockReturnValue({ id: 'resp_123', output: [] }),
  generateResponseId: jest.fn().mockReturnValue('resp_mock-123'),
  isValidationFailure: jest.fn().mockReturnValue(false),
  emitResponseCreated: jest.fn(),
  createResponseContext: jest.fn().mockReturnValue({ responseId: 'resp_123' }),
  createResponseTracker: jest.fn().mockReturnValue({
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
  setupStreamingResponse: jest.fn(),
  emitResponseInProgress: jest.fn(),
  convertInputToMessages: jest.fn().mockReturnValue([]),
  validateResponseRequest: jest.fn().mockReturnValue({
    request: { model: 'agent-123', input: 'Hello', stream: false },
  }),
  buildAggregatedResponse: jest.fn().mockReturnValue({
    id: 'resp_123',
    status: 'completed',
    output: [],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  }),
  createResponseAggregator: jest.fn().mockReturnValue({
    usage: { promptTokens: 100, completionTokens: 50 },
  }),
  sendResponsesErrorResponse: jest.fn(),
  createResponsesEventHandlers: jest.fn().mockReturnValue({
    handlers: {
      on_message_delta: { handle: jest.fn() },
      on_reasoning_delta: { handle: jest.fn() },
      on_run_step: { handle: jest.fn() },
      on_run_step_delta: { handle: jest.fn() },
      on_chat_model_end: { handle: jest.fn() },
    },
    finalizeStream: jest.fn(),
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

jest.mock('~/server/controllers/agents/callbacks', () => ({
  createToolEndCallback: jest.fn().mockReturnValue(jest.fn()),
  createResponsesToolEndCallback: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/models', () => ({
  getAgent: jest.fn().mockResolvedValue({ id: 'agent-123', name: 'Test Agent' }),
  getFiles: jest.fn(),
  getUserKey: jest.fn(),
  getMessages: jest.fn().mockResolvedValue([]),
  saveMessage: jest.fn().mockResolvedValue({}),
  updateFilesUsage: jest.fn(),
  getUserKeyValues: jest.fn(),
  getUserCodeFiles: jest.fn(),
  getToolFilesByIds: jest.fn(),
  getCodeGeneratedFiles: jest.fn(),
  spendTokens: mockSpendTokens,
  spendStructuredTokens: mockSpendStructuredTokens,
  getConvoFiles: jest.fn().mockResolvedValue([]),
  saveConvo: jest.fn().mockResolvedValue({}),
  getConvo: jest.fn().mockResolvedValue(null),
}));

describe('createResponse controller', () => {
  let createResponse;
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = require('../responses');
    createResponse = controller.createResponse;

    req = {
      body: {
        model: 'agent-123',
        input: 'Hello',
        stream: false,
      },
      user: { id: 'user-123' },
      config: {
        endpoints: {
          agents: { allowedProviders: ['anthropic'] },
        },
      },
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

  describe('token usage recording - non-streaming', () => {
    it('should call recordCollectedUsage after successful non-streaming completion', async () => {
      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        { spendTokens: mockSpendTokens, spendStructuredTokens: mockSpendStructuredTokens },
        expect.objectContaining({
          user: 'user-123',
          conversationId: expect.any(String),
          collectedUsage: expect.any(Array),
          context: 'message',
        }),
      );
    });

    it('should pass balance and transactions config to recordCollectedUsage', async () => {
      mockGetBalanceConfig.mockReturnValue({ enabled: true, startBalance: 2000 });
      mockGetTransactionsConfig.mockReturnValue({ enabled: true });

      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          balance: { enabled: true, startBalance: 2000 },
          transactions: { enabled: true },
        }),
      );
    });

    it('should pass spendTokens and spendStructuredTokens as dependencies', async () => {
      await createResponse(req, res);

      const [deps] = mockRecordCollectedUsage.mock.calls[0];
      expect(deps).toHaveProperty('spendTokens', mockSpendTokens);
      expect(deps).toHaveProperty('spendStructuredTokens', mockSpendStructuredTokens);
    });

    it('should include model from primaryConfig in recordCollectedUsage params', async () => {
      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          model: 'claude-3',
        }),
      );
    });
  });

  describe('token usage recording - streaming', () => {
    beforeEach(() => {
      req.body.stream = true;

      const api = require('@librechat/api');
      api.validateResponseRequest.mockReturnValue({
        request: { model: 'agent-123', input: 'Hello', stream: true },
      });
    });

    it('should call recordCollectedUsage after successful streaming completion', async () => {
      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        { spendTokens: mockSpendTokens, spendStructuredTokens: mockSpendStructuredTokens },
        expect.objectContaining({
          user: 'user-123',
          context: 'message',
        }),
      );
    });
  });

  describe('collectedUsage population', () => {
    it('should collect usage from on_chat_model_end events', async () => {
      const api = require('@librechat/api');

      let capturedOnChatModelEnd;
      api.createAggregatorEventHandlers.mockImplementation(() => {
        return {
          on_message_delta: { handle: jest.fn() },
          on_reasoning_delta: { handle: jest.fn() },
          on_run_step: { handle: jest.fn() },
          on_run_step_delta: { handle: jest.fn() },
          on_chat_model_end: {
            handle: jest.fn((event, data) => {
              if (capturedOnChatModelEnd) {
                capturedOnChatModelEnd(event, data);
              }
            }),
          },
        };
      });

      api.createRun.mockImplementation(async ({ customHandlers }) => {
        capturedOnChatModelEnd = (event, data) => {
          customHandlers.on_chat_model_end.handle(event, data);
        };

        return {
          processStream: jest.fn().mockImplementation(async () => {
            customHandlers.on_chat_model_end.handle('on_chat_model_end', {
              output: {
                usage_metadata: {
                  input_tokens: 150,
                  output_tokens: 75,
                  model: 'claude-3',
                },
              },
            });
          }),
        };
      });

      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          collectedUsage: expect.arrayContaining([
            expect.objectContaining({
              input_tokens: 150,
              output_tokens: 75,
            }),
          ]),
        }),
      );
    });
  });
});
