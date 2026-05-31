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
const mockExtractRemoteAgentResponseFiles = jest
  .fn()
  .mockImplementation((input) => ({ value: input, files: [] }));
const mockEncodeAndFormatDocuments = jest.fn().mockResolvedValue({ documents: [], files: [] });
const mockFilterFilesByEndpointConfig = jest.fn((_, { files }) => files ?? []);
const mockAttachDocumentsToMessageContent = jest.fn((message, documents, fallbackText) => {
  const content = [];
  let documentIndex = 0;
  let hasText = false;

  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part?.type === 'text') {
        const text = part.text ?? '';
        if (!text.trim()) {
          continue;
        }
        if (/^\[File: .+\]$/.test(text.trim()) && documentIndex < documents.length) {
          content.push(documents[documentIndex]);
          documentIndex += 1;
          continue;
        }
        hasText = true;
        content.push(part);
      } else if (part?.type === 'image_url') {
        content.push(part);
      }
    }
  } else if (typeof message?.content === 'string' && message.content.trim()) {
    hasText = true;
    content.push({ type: 'text', text: message.content });
  }

  content.push(...documents.slice(documentIndex));
  if (!hasText) {
    content.unshift({ type: 'text', text: fallbackText });
  }

  message.content = content;
});

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
  scopeSkillIds: jest.fn().mockImplementation((ids) => ids),
  resolveAgentScopedSkillIds: jest
    .fn()
    .mockImplementation(({ accessibleSkillIds }) => accessibleSkillIds),
  loadSkillStates: jest.fn().mockResolvedValue({ skillStates: {}, defaultActiveOnShare: false }),
  createSafeUser: jest.fn().mockReturnValue({ id: 'user-123' }),
  initializeAgent: jest.fn().mockResolvedValue({
    id: 'agent-123',
    model: 'claude-3',
    provider: 'anthropic',
    model_parameters: {},
    toolRegistry: {},
    edges: [],
  }),
  encodeAndFormatDocuments: mockEncodeAndFormatDocuments,
  filterFilesByEndpointConfig: mockFilterFilesByEndpointConfig,
  discoverConnectedAgents: jest.fn().mockResolvedValue({
    agentConfigs: new Map(),
    edges: [],
    skippedAgentIds: new Set(),
    userMCPAuthMap: undefined,
  }),
  getBalanceConfig: mockGetBalanceConfig,
  getTransactionsConfig: mockGetTransactionsConfig,
  recordCollectedUsage: mockRecordCollectedUsage,
  extractRemoteAgentResponseFiles: mockExtractRemoteAgentResponseFiles,
  attachDocumentsToMessageContent: mockAttachDocumentsToMessageContent,
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

const mockGetMultiplier = jest.fn().mockReturnValue(1);
const mockGetCacheMultiplier = jest.fn().mockReturnValue(null);

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
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn(),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn().mockReturnValue({}),
}));

jest.mock('~/server/services/Files/Code/crud', () => ({
  batchUploadCodeEnvFiles: jest.fn().mockResolvedValue({ session_id: '', files: [] }),
}));

jest.mock('~/server/services/Files/Code/process', () => ({
  getSessionInfo: jest.fn().mockResolvedValue(null),
  checkIfActive: jest.fn().mockReturnValue(false),
}));

const mockUpdateBalance = jest.fn().mockResolvedValue({});
const mockBulkInsertTransactions = jest.fn().mockResolvedValue(undefined);

jest.mock('~/models', () => ({
  getAgent: jest
    .fn()
    .mockResolvedValue({ id: 'agent-123', name: 'Test Agent', provider: 'anthropic' }),
  getFiles: jest.fn(),
  getUserKey: jest.fn(),
  getMessages: jest.fn().mockResolvedValue([]),
  saveMessage: jest.fn().mockResolvedValue({}),
  updateFilesUsage: jest.fn(),
  getUserKeyValues: jest.fn(),
  getUserCodeFiles: jest.fn(),
  getToolFilesByIds: jest.fn(),
  getCodeGeneratedFiles: jest.fn(),
  updateBalance: mockUpdateBalance,
  bulkInsertTransactions: mockBulkInsertTransactions,
  spendTokens: mockSpendTokens,
  spendStructuredTokens: mockSpendStructuredTokens,
  getMultiplier: mockGetMultiplier,
  getCacheMultiplier: mockGetCacheMultiplier,
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

  describe('conversation ownership validation', () => {
    it('should skip ownership check when previous_response_id is not provided', async () => {
      const { getConvo } = require('~/models');
      await createResponse(req, res);
      expect(getConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when previous_response_id is not a string', async () => {
      const { validateResponseRequest, sendResponsesErrorResponse } = require('@librechat/api');
      validateResponseRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          input: 'Hello',
          stream: false,
          previous_response_id: { $gt: '' },
        },
      });

      await createResponse(req, res);
      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        400,
        'previous_response_id must be a string',
        'invalid_request',
      );
    });

    it('should return 404 when conversation is not owned by user', async () => {
      const { validateResponseRequest, sendResponsesErrorResponse } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateResponseRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          input: 'Hello',
          stream: false,
          previous_response_id: 'resp_abc',
        },
      });
      getConvo.mockResolvedValueOnce(null);

      await createResponse(req, res);
      expect(getConvo).toHaveBeenCalledWith('user-123', 'resp_abc');
      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        404,
        'Conversation not found',
        'not_found',
      );
    });

    it('should proceed when conversation is owned by user', async () => {
      const { validateResponseRequest, sendResponsesErrorResponse } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateResponseRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          input: 'Hello',
          stream: false,
          previous_response_id: 'resp_abc',
        },
      });
      getConvo.mockResolvedValueOnce({ conversationId: 'resp_abc', user: 'user-123' });

      await createResponse(req, res);
      expect(getConvo).toHaveBeenCalledWith('user-123', 'resp_abc');
      expect(sendResponsesErrorResponse).not.toHaveBeenCalledWith(
        res,
        404,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should return 500 when getConvo throws a DB error', async () => {
      const { validateResponseRequest, sendResponsesErrorResponse } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateResponseRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          input: 'Hello',
          stream: false,
          previous_response_id: 'resp_abc',
        },
      });
      getConvo.mockRejectedValueOnce(new Error('DB connection failed'));

      await createResponse(req, res);
      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        500,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('token usage recording - non-streaming', () => {
    it('should call recordCollectedUsage after successful non-streaming completion', async () => {
      await createResponse(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledTimes(1);
      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        {
          spendTokens: mockSpendTokens,
          spendStructuredTokens: mockSpendStructuredTokens,
          pricing: { getMultiplier: mockGetMultiplier, getCacheMultiplier: mockGetCacheMultiplier },
          bulkWriteOps: {
            insertMany: mockBulkInsertTransactions,
            updateBalance: mockUpdateBalance,
          },
        },
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

    it('should pass spendTokens, spendStructuredTokens, pricing, and bulkWriteOps as dependencies', async () => {
      await createResponse(req, res);

      const [deps] = mockRecordCollectedUsage.mock.calls[0];
      expect(deps).toHaveProperty('spendTokens', mockSpendTokens);
      expect(deps).toHaveProperty('spendStructuredTokens', mockSpendStructuredTokens);
      expect(deps).toHaveProperty('pricing');
      expect(deps.pricing).toHaveProperty('getMultiplier', mockGetMultiplier);
      expect(deps.pricing).toHaveProperty('getCacheMultiplier', mockGetCacheMultiplier);
      expect(deps).toHaveProperty('bulkWriteOps');
      expect(deps.bulkWriteOps).toHaveProperty('insertMany', mockBulkInsertTransactions);
      expect(deps.bulkWriteOps).toHaveProperty('updateBalance', mockUpdateBalance);
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
        {
          spendTokens: mockSpendTokens,
          spendStructuredTokens: mockSpendStructuredTokens,
          pricing: { getMultiplier: mockGetMultiplier, getCacheMultiplier: mockGetCacheMultiplier },
          bulkWriteOps: {
            insertMany: mockBulkInsertTransactions,
            updateBalance: mockUpdateBalance,
          },
        },
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

      api.createRun.mockImplementation(async ({ customHandlers }) => {
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

  describe('remote inline provider files', () => {
    const inlineFile = {
      file_id: 'remote-file-1',
      temp_file_id: 'remote-file-1',
      filename: 'document.pdf',
      filepath: '',
      source: 'remote_inline',
      type: 'application/pdf',
      bytes: 8,
      object: 'file',
      usage: 1,
      user: 'user-123',
      metadata: { inlineBase64: 'JVBERi0x' },
    };

    it('should attach encoded documents before formatting non-streaming messages', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      const {
        convertInputToMessages,
        encodeAndFormatDocuments,
        initializeAgent,
      } = require('@librechat/api');
      const { getStrategyFunctions } = require('~/server/services/Files/strategies');
      const cleanedInput = [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: '[File: document.pdf]' }],
        },
      ];
      const convertedMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: '[File: document.pdf]' }],
        },
      ];
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: cleanedInput,
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce(convertedMessages);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'document', source: { type: 'base64', data: 'JVBERi0x' } }],
        files: [],
      });

      await createResponse(req, res);

      expect(convertInputToMessages).toHaveBeenCalledWith(cleanedInput);
      expect(encodeAndFormatDocuments).toHaveBeenCalledWith(
        req,
        [inlineFile],
        expect.objectContaining({
          provider: 'anthropic',
          endpoint: 'anthropic',
          model: 'claude-3',
        }),
        getStrategyFunctions,
      );
      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Attached file(s): document.pdf' },
              { type: 'document', source: { type: 'base64', data: 'JVBERi0x' } },
            ],
          },
        ],
        {},
        expect.any(Set),
      );
      expect(initializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({ requestFiles: [] }),
        expect.any(Object),
      );
    });

    it('should attach encoded documents before formatting streaming messages', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      const { convertInputToMessages, validateResponseRequest } = require('@librechat/api');
      const convertedMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: '[File: document.pdf]' }],
        },
      ];
      validateResponseRequest.mockReturnValueOnce({
        request: { model: 'agent-123', input: req.body.input, stream: true },
      });
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ type: 'message', role: 'user', content: [] }],
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce(convertedMessages);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'document', source: { type: 'base64', data: 'JVBERi0x' } }],
        files: [],
      });

      await createResponse(req, res);

      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Attached file(s): document.pdf' },
              { type: 'document', source: { type: 'base64', data: 'JVBERi0x' } },
            ],
          },
        ],
        {},
        expect.any(Set),
      );
    });

    it('should support multiple inline files without passing them to agent requestFiles', async () => {
      const { discoverConnectedAgents, initializeAgent } = require('@librechat/api');
      const secondFile = { ...inlineFile, file_id: 'remote-file-2', filename: 'notes.txt' };
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: [{ type: 'input_text', text: 'Files attached' }] }],
        files: [inlineFile, secondFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [
          { type: 'document', source: { type: 'base64', data: 'JVBERi0x' } },
          { type: 'document', source: { type: 'base64', data: 'SGVsbG8=' } },
        ],
        files: [],
      });
      const convertedMessages = [{ role: 'user', content: 'Files attached' }];
      const { convertInputToMessages } = require('@librechat/api');
      convertInputToMessages.mockReturnValueOnce(convertedMessages);

      await createResponse(req, res);

      expect(mockEncodeAndFormatDocuments).toHaveBeenCalledWith(
        req,
        [inlineFile, secondFile],
        expect.any(Object),
        expect.any(Function),
      );
      expect(initializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({ requestFiles: [] }),
        expect.any(Object),
      );
      expect(discoverConnectedAgents).not.toHaveBeenCalled();
    });

    it('should attach files from Responses message-like input items without type', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      const { convertInputToMessages, validateResponseRequest } = require('@librechat/api');
      const input = [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extract this PDF.' },
            { type: 'input_file', filename: 'document.pdf', file_data: 'data' },
          ],
        },
      ];
      const cleanedInput = [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extract this PDF.' },
            { type: 'input_text', text: '[File: document.pdf]' },
          ],
        },
      ];
      validateResponseRequest.mockReturnValueOnce({
        request: { model: 'agent-123', input, stream: false },
      });
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: cleanedInput,
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this PDF.' },
            { type: 'text', text: '[File: document.pdf]' },
          ],
        },
      ]);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'document', source: { type: 'base64', data: 'JVBERi0x' } }],
        files: [],
      });

      await createResponse(req, res);

      expect(mockExtractRemoteAgentResponseFiles).toHaveBeenCalledWith(input, 'user-123');
      expect(convertInputToMessages).toHaveBeenCalledWith(cleanedInput);
      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract this PDF.' },
              { type: 'document', source: { type: 'base64', data: 'JVBERi0x' } },
            ],
          },
        ],
        {},
        expect.any(Set),
      );
    });

    it('should return a Responses-compatible 400 for malformed inline file input', async () => {
      const { sendResponsesErrorResponse } = require('@librechat/api');
      mockExtractRemoteAgentResponseFiles.mockImplementationOnce(() => {
        const error = new Error('File "document.pdf" must use a base64 data URL.');
        error.statusCode = 400;
        throw error;
      });

      await createResponse(req, res);

      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        400,
        'File "document.pdf" must use a base64 data URL.',
        'invalid_request',
      );
      expect(mockEncodeAndFormatDocuments).not.toHaveBeenCalled();
    });

    it('should use a nonblank fallback text block when document message text is empty', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      const { convertInputToMessages } = require('@librechat/api');
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '' }] }],
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce([
        { role: 'user', content: [{ type: 'text', text: '' }] },
      ]);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'document', document: { name: 'document', source: { bytes: [] } } }],
        files: [],
      });

      await createResponse(req, res);

      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            role: 'user',
            content: [
              { type: 'text', text: 'Attached file(s): document.pdf' },
              { type: 'document', document: { name: 'document', source: { bytes: [] } } },
            ],
          }),
        ],
        {},
        expect.any(Set),
      );
    });

    it('should return 400 when provider formatting skips an inline file', async () => {
      const {
        createRun,
        convertInputToMessages,
        sendResponsesErrorResponse,
      } = require('@librechat/api');
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: [{ type: 'input_text', text: 'Files attached' }] }],
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce([{ role: 'user', content: 'Files attached' }]);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({ documents: [], files: [] });

      await createResponse(req, res);

      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        400,
        'One or more file inputs are not supported by the configured provider.',
        'invalid_request',
        'unsupported_file',
      );
      expect(createRun).not.toHaveBeenCalled();
    });

    it('should return 400 when file upload settings reject an inline file', async () => {
      const {
        createRun,
        convertInputToMessages,
        filterFilesByEndpointConfig,
        sendResponsesErrorResponse,
      } = require('@librechat/api');
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: [{ type: 'input_text', text: 'Files attached' }] }],
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce([{ role: 'user', content: 'Files attached' }]);
      mockFilterFilesByEndpointConfig.mockReturnValueOnce([]);

      await createResponse(req, res);

      expect(filterFilesByEndpointConfig).toHaveBeenCalledWith(req, {
        files: [inlineFile],
        endpoint: 'anthropic',
        endpointType: 'anthropic',
      });
      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        400,
        'One or more file inputs are not allowed by the configured file upload settings.',
        'invalid_request',
        'unsupported_file',
      );
      expect(mockEncodeAndFormatDocuments).not.toHaveBeenCalled();
      expect(createRun).not.toHaveBeenCalled();
    });

    it('should not persist transient inline document payloads when store is true', async () => {
      const { convertInputToMessages, validateResponseRequest } = require('@librechat/api');
      const { saveMessage } = require('~/models');
      validateResponseRequest.mockReturnValueOnce({
        request: { model: 'agent-123', input: req.body.input, stream: false, store: true },
      });
      mockExtractRemoteAgentResponseFiles.mockReturnValueOnce({
        value: [{ type: 'message', role: 'user', content: [] }],
        files: [inlineFile],
      });
      convertInputToMessages.mockReturnValueOnce([
        {
          role: 'user',
          content: [{ type: 'text', text: '[File: document.pdf]' }],
        },
      ]);
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: 'JVBERi0x',
            },
          },
        ],
        files: [],
      });

      await createResponse(req, res);

      expect(saveMessage).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          isCreatedByUser: true,
          text: JSON.stringify([{ type: 'text', text: '[File: document.pdf]' }]),
        }),
        expect.any(Object),
      );
      expect(saveMessage).not.toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          text: expect.stringContaining('JVBERi0x'),
        }),
        expect.any(Object),
      );
    });
  });
});
