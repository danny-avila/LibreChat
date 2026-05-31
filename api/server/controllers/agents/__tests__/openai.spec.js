/**
 * Unit tests for OpenAI-compatible API controller
 * Tests that recordCollectedUsage is called correctly for token spending
 */

const mockProcessStream = jest.fn().mockResolvedValue(undefined);
const mockSpendTokens = jest.fn().mockResolvedValue({});
const mockSpendStructuredTokens = jest.fn().mockResolvedValue({});
const mockRecordCollectedUsage = jest
  .fn()
  .mockResolvedValue({ input_tokens: 100, output_tokens: 50 });
const mockGetBalanceConfig = jest.fn().mockReturnValue({ enabled: true });
const mockGetTransactionsConfig = jest.fn().mockReturnValue({ enabled: true });
const mockExtractRemoteAgentChatFiles = jest
  .fn()
  .mockImplementation((messages) => ({ value: messages, files: [] }));
const mockEncodeAndFormatDocuments = jest.fn().mockResolvedValue({ documents: [], files: [] });
const mockFilterFilesByEndpointConfig = jest.fn((_, { files }) => files ?? []);
const mockGetEndpointFileLimit = jest.fn().mockReturnValue(10);
const remoteInlineFileMarkerPrefix = '__LIBRECHAT_REMOTE_INLINE_FILE__:';
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
        if (
          text.trim().startsWith(remoteInlineFileMarkerPrefix) &&
          documentIndex < documents.length
        ) {
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
  writeSSE: jest.fn(),
  createRun: jest.fn().mockResolvedValue({
    processStream: mockProcessStream,
  }),
  createChunk: jest.fn().mockReturnValue({}),
  buildToolSet: jest.fn().mockReturnValue(new Set()),
  scopeSkillIds: jest.fn().mockImplementation((ids) => ids),
  resolveAgentScopedSkillIds: jest
    .fn()
    .mockImplementation(({ accessibleSkillIds }) => accessibleSkillIds),
  loadSkillStates: jest.fn().mockResolvedValue({ skillStates: {}, defaultActiveOnShare: false }),
  sendFinalChunk: jest.fn(),
  createSafeUser: jest.fn().mockReturnValue({ id: 'user-123' }),
  validateRequest: jest
    .fn()
    .mockReturnValue({ request: { model: 'agent-123', messages: [], stream: false } }),
  initializeAgent: jest.fn().mockResolvedValue({
    id: 'agent-123',
    model: 'gpt-4',
    provider: 'openAI',
    model_parameters: {},
    toolRegistry: {},
    edges: [],
  }),
  encodeAndFormatDocuments: mockEncodeAndFormatDocuments,
  filterFilesByEndpointConfig: mockFilterFilesByEndpointConfig,
  getEndpointFileLimit: mockGetEndpointFileLimit,
  getBalanceConfig: mockGetBalanceConfig,
  createErrorResponse: jest.fn(),
  extractRemoteAgentChatFiles: mockExtractRemoteAgentChatFiles,
  attachDocumentsToMessageContent: mockAttachDocumentsToMessageContent,
  getTransactionsConfig: mockGetTransactionsConfig,
  recordCollectedUsage: mockRecordCollectedUsage,
  extractManualSkills: jest.fn().mockReturnValue(undefined),
  injectSkillPrimes: jest.fn().mockReturnValue({
    initialMessages: [],
    indexTokenCountMap: {},
    inserted: 0,
    insertIdx: -1,
    alwaysApplyDropped: 0,
    alwaysApplyDedupedFromManual: 0,
  }),
  buildNonStreamingResponse: jest.fn().mockReturnValue({ id: 'resp-123' }),
  createOpenAIStreamTracker: jest.fn().mockReturnValue({
    addText: jest.fn(),
    addReasoning: jest.fn(),
    toolCalls: new Map(),
    usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 },
  }),
  createOpenAIContentAggregator: jest.fn().mockReturnValue({
    addText: jest.fn(),
    addReasoning: jest.fn(),
    getText: jest.fn().mockReturnValue(''),
    getReasoning: jest.fn().mockReturnValue(''),
    toolCalls: new Map(),
    usage: { promptTokens: 100, completionTokens: 50, reasoningTokens: 0 },
  }),
  resolveRecursionLimit: jest.fn().mockReturnValue(50),
  createToolExecuteHandler: jest.fn().mockReturnValue({ handle: jest.fn() }),
  isChatCompletionValidationFailure: jest.fn().mockReturnValue(false),
  discoverConnectedAgents: jest.fn().mockResolvedValue({
    agentConfigs: new Map(),
    edges: [],
    skippedAgentIds: new Set(),
    userMCPAuthMap: undefined,
  }),
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

jest.mock('~/server/services/ToolService', () => ({
  loadAgentTools: jest.fn().mockResolvedValue([]),
  loadToolsForExecution: jest.fn().mockResolvedValue([]),
}));

const mockGetMultiplier = jest.fn().mockReturnValue(1);
const mockGetCacheMultiplier = jest.fn().mockReturnValue(null);

jest.mock('~/server/controllers/agents/callbacks', () => ({
  createToolEndCallback: jest.fn().mockReturnValue(jest.fn()),
  buildSummarizationHandlers: jest.fn().mockReturnValue({}),
  markSummarizationUsage: jest.fn().mockImplementation((usage) => usage),
  agentLogHandlerObj: { handle: jest.fn() },
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  checkPermission: jest.fn().mockResolvedValue(true),
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
    .mockResolvedValue({ id: 'agent-123', name: 'Test Agent', provider: 'openAI' }),
  getFiles: jest.fn(),
  getUserKey: jest.fn(),
  getMessages: jest.fn(),
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
  getConvo: jest.fn().mockResolvedValue(null),
}));

describe('OpenAIChatCompletionController', () => {
  let OpenAIChatCompletionController;
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    const controller = require('../openai');
    OpenAIChatCompletionController = controller.OpenAIChatCompletionController;

    req = {
      body: {
        model: 'agent-123',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      },
      user: { id: 'user-123' },
      config: {
        endpoints: {
          agents: { allowedProviders: ['openAI'] },
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
    it('should skip ownership check when conversation_id is not provided', async () => {
      const { getConvo } = require('~/models');
      await OpenAIChatCompletionController(req, res);
      expect(getConvo).not.toHaveBeenCalled();
    });

    it('should return 400 when conversation_id is not a string', async () => {
      const { validateRequest } = require('@librechat/api');
      validateRequest.mockReturnValueOnce({
        request: { model: 'agent-123', messages: [], stream: false, conversation_id: { $gt: '' } },
      });

      await OpenAIChatCompletionController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when conversation is not owned by user', async () => {
      const { validateRequest } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          messages: [],
          stream: false,
          conversation_id: 'convo-abc',
        },
      });
      getConvo.mockResolvedValueOnce(null);

      await OpenAIChatCompletionController(req, res);
      expect(getConvo).toHaveBeenCalledWith('user-123', 'convo-abc');
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should proceed when conversation is owned by user', async () => {
      const { validateRequest } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          messages: [],
          stream: false,
          conversation_id: 'convo-abc',
        },
      });
      getConvo.mockResolvedValueOnce({ conversationId: 'convo-abc', user: 'user-123' });

      await OpenAIChatCompletionController(req, res);
      expect(getConvo).toHaveBeenCalledWith('user-123', 'convo-abc');
      expect(res.status).not.toHaveBeenCalledWith(404);
    });

    it('should return 500 when getConvo throws a DB error', async () => {
      const { validateRequest } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          messages: [],
          stream: false,
          conversation_id: 'convo-abc',
        },
      });
      getConvo.mockRejectedValueOnce(new Error('DB connection failed'));

      await OpenAIChatCompletionController(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('token usage recording', () => {
    it('should call recordCollectedUsage after successful non-streaming completion', async () => {
      await OpenAIChatCompletionController(req, res);

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
          balance: { enabled: true },
          transactions: { enabled: true },
        }),
      );
    });

    it('should pass balance and transactions config to recordCollectedUsage', async () => {
      mockGetBalanceConfig.mockReturnValue({ enabled: true, startBalance: 1000 });
      mockGetTransactionsConfig.mockReturnValue({ enabled: true, rateLimit: 100 });

      await OpenAIChatCompletionController(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          balance: { enabled: true, startBalance: 1000 },
          transactions: { enabled: true, rateLimit: 100 },
        }),
      );
    });

    it('should pass spendTokens, spendStructuredTokens, pricing, and bulkWriteOps as dependencies', async () => {
      await OpenAIChatCompletionController(req, res);

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
      await OpenAIChatCompletionController(req, res);

      expect(mockRecordCollectedUsage).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          model: 'gpt-4',
        }),
      );
    });
  });

  describe('recursionLimit resolution', () => {
    it('should pass resolveRecursionLimit result to processStream config', async () => {
      const { resolveRecursionLimit } = require('@librechat/api');
      resolveRecursionLimit.mockReturnValueOnce(75);

      await OpenAIChatCompletionController(req, res);

      expect(mockProcessStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recursionLimit: 75 }),
        expect.anything(),
      );
    });

    it('should call resolveRecursionLimit with agentsEConfig and agent', async () => {
      const { resolveRecursionLimit } = require('@librechat/api');
      const { getAgent } = require('~/models');
      const mockAgent = { id: 'agent-123', name: 'Test', recursion_limit: 200 };
      getAgent.mockResolvedValueOnce(mockAgent);

      req.config = {
        endpoints: {
          agents: { recursionLimit: 100, maxRecursionLimit: 150, allowedProviders: [] },
        },
      };

      await OpenAIChatCompletionController(req, res);

      expect(resolveRecursionLimit).toHaveBeenCalledWith(req.config.endpoints.agents, mockAgent);
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
      const { encodeAndFormatDocuments, initializeAgent } = require('@librechat/api');
      const { getStrategyFunctions } = require('~/server/services/Files/strategies');
      const cleanedMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: `${remoteInlineFileMarkerPrefix}remote-file-1` }],
        },
      ];
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: cleanedMessages,
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'file', file: { filename: 'document.pdf', file_data: 'data' } }],
        files: [],
      });

      await OpenAIChatCompletionController(req, res);

      expect(encodeAndFormatDocuments).toHaveBeenCalledWith(
        req,
        [inlineFile],
        expect.objectContaining({
          provider: 'openAI',
          endpoint: 'openAI',
          model: 'gpt-4',
        }),
        getStrategyFunctions,
      );
      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Attached file(s): document.pdf' },
              { type: 'file', file: { filename: 'document.pdf', file_data: 'data' } },
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
      const { validateRequest } = require('@librechat/api');
      const cleanedMessages = [
        {
          role: 'user',
          content: [{ type: 'text', text: `${remoteInlineFileMarkerPrefix}remote-file-1` }],
        },
      ];
      validateRequest.mockReturnValueOnce({
        request: { model: 'agent-123', messages: req.body.messages, stream: true },
      });
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: cleanedMessages,
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'file', file: { filename: 'document.pdf', file_data: 'data' } }],
        files: [],
      });

      await OpenAIChatCompletionController(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Attached file(s): document.pdf' },
              { type: 'file', file: { filename: 'document.pdf', file_data: 'data' } },
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
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: 'Files attached' }],
        files: [inlineFile, secondFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [
          { type: 'file', file: { filename: 'document.pdf', file_data: 'data' } },
          { type: 'file', file: { filename: 'notes.txt', file_data: 'data' } },
        ],
        files: [],
      });

      await OpenAIChatCompletionController(req, res);

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

    it('should return an OpenAI-compatible 400 for malformed inline file input', async () => {
      mockExtractRemoteAgentChatFiles.mockImplementationOnce(() => {
        const error = new Error('File "document.pdf" must use a base64 data URL.');
        error.statusCode = 400;
        throw error;
      });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockEncodeAndFormatDocuments).not.toHaveBeenCalled();
    });

    it('should use a nonblank fallback text block when document message text is empty', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: [{ type: 'text', text: '' }] }],
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'document', document: { name: 'document', source: { bytes: [] } } }],
        files: [],
      });

      await OpenAIChatCompletionController(req, res);

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

    it('should preserve text and image order when attaching inline documents', async () => {
      const { formatAgentMessages } = require('@librechat/agents');
      const imagePart = {
        type: 'image_url',
        image_url: { url: 'https://example.com/image.png' },
      };
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Look at this image first.' },
              imagePart,
              { type: 'text', text: 'Now compare it with the file.' },
              { type: 'text', text: `${remoteInlineFileMarkerPrefix}remote-file-1` },
            ],
          },
        ],
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({
        documents: [{ type: 'file', file: { filename: 'document.pdf', file_data: 'data' } }],
        files: [],
      });

      await OpenAIChatCompletionController(req, res);

      expect(formatAgentMessages).toHaveBeenCalledWith(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Look at this image first.' },
              imagePart,
              { type: 'text', text: 'Now compare it with the file.' },
              { type: 'file', file: { filename: 'document.pdf', file_data: 'data' } },
            ],
          },
        ],
        {},
        expect.any(Set),
      );
    });

    it('should return 400 when provider formatting skips an inline file', async () => {
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: 'Files attached' }],
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({ documents: [], files: [] });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockProcessStream).not.toHaveBeenCalled();
    });

    it('should return 400 when file upload settings reject an inline file', async () => {
      const { filterFilesByEndpointConfig } = require('@librechat/api');
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: 'Files attached' }],
        files: [inlineFile],
      });
      mockFilterFilesByEndpointConfig.mockReturnValueOnce([]);

      await OpenAIChatCompletionController(req, res);

      expect(filterFilesByEndpointConfig).toHaveBeenCalledWith(req, {
        files: [inlineFile],
        endpoint: 'openAI',
        endpointType: 'openAI',
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockEncodeAndFormatDocuments).not.toHaveBeenCalled();
      expect(mockProcessStream).not.toHaveBeenCalled();
    });

    it('should return 400 when inline files exceed the configured file limit', async () => {
      const secondFile = { ...inlineFile, file_id: 'remote-file-2', filename: 'notes.txt' };
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: 'Files attached' }],
        files: [inlineFile, secondFile],
      });
      mockGetEndpointFileLimit.mockReturnValueOnce(1);

      await OpenAIChatCompletionController(req, res);

      expect(mockGetEndpointFileLimit).toHaveBeenCalledWith(req, {
        endpoint: 'openAI',
        endpointType: 'openAI',
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockFilterFilesByEndpointConfig).not.toHaveBeenCalled();
      expect(mockEncodeAndFormatDocuments).not.toHaveBeenCalled();
      expect(mockProcessStream).not.toHaveBeenCalled();
    });

    it('should return 400 before opening a stream when provider formatting skips an inline file', async () => {
      const { validateRequest } = require('@librechat/api');
      validateRequest.mockReturnValueOnce({
        request: { model: 'agent-123', messages: req.body.messages, stream: true },
      });
      mockExtractRemoteAgentChatFiles.mockReturnValueOnce({
        value: [{ role: 'user', content: 'Files attached' }],
        files: [inlineFile],
      });
      mockEncodeAndFormatDocuments.mockResolvedValueOnce({ documents: [], files: [] });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).not.toHaveBeenCalled();
      expect(mockProcessStream).not.toHaveBeenCalled();
    });
  });
});
