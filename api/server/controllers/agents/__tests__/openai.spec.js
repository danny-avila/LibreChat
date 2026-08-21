/**
 * Unit tests for OpenAI-compatible API controller
 * Tests that recordCollectedUsage is called correctly for token spending
 */

const { ErrorTypes, ResourceType } = require('librechat-data-provider');

const mockProcessStream = jest.fn().mockResolvedValue(undefined);
const mockSpendTokens = jest.fn().mockResolvedValue({});
const mockSpendStructuredTokens = jest.fn().mockResolvedValue({});
const mockRecordCollectedUsage = jest
  .fn()
  .mockResolvedValue({ input_tokens: 100, output_tokens: 50 });
const mockGetBalanceConfig = jest.fn().mockReturnValue({ enabled: true });
const mockGetTransactionsConfig = jest.fn().mockReturnValue({ enabled: true });
const mockResolveMemoryAvailability = jest.fn().mockResolvedValue(true);
const mockBuildAgentScopedContext = jest.fn().mockResolvedValue(new Map());
const mockBuildAgentContextAttachmentsByAgentId = jest.fn().mockReturnValue(new Map());
const mockBuildInlineMemoryContext = jest.fn().mockResolvedValue('');
const mockApplyContextToAgent = jest.fn().mockResolvedValue(undefined);
const mockInitialSessions = new Map([['execute_code', { session_id: 'seeded' }]]);
class MockAgentRunEnvelopeError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'AgentRunEnvelopeError';
  }
}
const mockCreateAgentRunEnvelope = jest.fn(
  ({ protocol, requestId, receivedAt, principal, payload }) => ({
    version: 1,
    protocol,
    requestId,
    receivedAt,
    principal: {
      userId: principal.id,
      ...(principal.role != null && { role: principal.role }),
      ...(principal.tenantId != null && { tenantId: principal.tenantId }),
    },
    payload: JSON.parse(JSON.stringify(payload)),
  }),
);
const mockBuildSkillPrimedIdsByName = jest.fn((manualSkillPrimes, alwaysApplySkillPrimes) => {
  const primed = {};
  for (const skill of alwaysApplySkillPrimes ?? []) {
    primed[skill.name] = skill._id.toString();
  }
  for (const skill of manualSkillPrimes ?? []) {
    primed[skill.name] = skill._id.toString();
  }
  return Object.keys(primed).length > 0 ? primed : undefined;
});
const mockEnrichWithSkillConfigurable = jest.fn((result) => result);
const mockBuildAgentToolContext = jest.fn(({ agent, config }) => ({
  agent,
  endpointTokenConfig: config.endpointTokenConfig,
  toolRegistry: config.toolRegistry,
  userMCPAuthMap: config.userMCPAuthMap,
  tool_resources: config.tool_resources,
  actionsEnabled: config.actionsEnabled,
  accessibleSkillIds: config.accessibleSkillIds,
  activeSkillNames: config.activeSkillNames,
  codeEnvAvailable: config.codeEnvAvailable,
  skillAuthoringAvailable: config.skillAuthoringAvailable,
  fileAuthoringToolNames: config.fileAuthoringToolNames,
  skillPrimedIdsByName:
    mockBuildSkillPrimedIdsByName(config.manualSkillPrimes, config.alwaysApplySkillPrimes) ?? {},
}));
const mockEnrichLoadedToolsWithAgentContext = jest.fn(({ result, req, ctx }) =>
  mockEnrichWithSkillConfigurable({
    result,
    context: {
      req,
      accessibleSkillIds: ctx.accessibleSkillIds,
      codeEnvAvailable: ctx.codeEnvAvailable === true,
      skillPrimedIdsByName: ctx.skillPrimedIdsByName,
      activeSkillNames: ctx.activeSkillNames,
      skillAuthoringAvailable: ctx.skillAuthoringAvailable === true,
      fileAuthoringToolNames: ctx.fileAuthoringToolNames,
    },
  }),
);
const mockCanAuthorSkillFiles = jest.fn(
  ({ scopedEditableSkillIds = [], skillCreateAllowed }) =>
    scopedEditableSkillIds.length > 0 || skillCreateAllowed === true,
);
const mockGetSkillToolDeps = jest.fn(() => ({}));

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
  /** Pass-through: the controller strips UI-only activity-label parts
   *  before SDK formatting; the mock must expose it like any other used
   *  export or the call throws before the assertions run. */
  stripActivityLabelParts: jest.fn((payload) => payload),
  writeSSE: jest.fn(),
  createRun: jest.fn().mockResolvedValue({
    processStream: mockProcessStream,
  }),
  applyContextToAgent: (...args) => mockApplyContextToAgent(...args),
  buildAgentScopedContext: (...args) => mockBuildAgentScopedContext(...args),
  buildInlineMemoryContext: (...args) => mockBuildInlineMemoryContext(...args),
  buildAgentContextAttachmentsByAgentId: (...args) =>
    mockBuildAgentContextAttachmentsByAgentId(...args),
  createChunk: jest.fn().mockReturnValue({}),
  buildToolSet: jest.fn().mockReturnValue(new Set()),
  buildInitialToolSessions: jest.fn().mockReturnValue(mockInitialSessions),
  AgentRunEnvelopeError: MockAgentRunEnvelopeError,
  createAgentRunEnvelope: (...args) => mockCreateAgentRunEnvelope(...args),
  createMCPRuntimeRequestBody: ({ messageId, conversationId, parentMessageId }) => ({
    messageId,
    conversationId,
    ...(parentMessageId !== undefined && {
      parentMessageId: parentMessageId ?? '00000000-0000-0000-0000-000000000000',
    }),
  }),
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
    model_parameters: {},
    toolRegistry: {},
    edges: [],
  }),
  getBalanceConfig: mockGetBalanceConfig,
  createErrorResponse: jest.fn(),
  getTransactionsConfig: mockGetTransactionsConfig,
  recordCollectedUsage: mockRecordCollectedUsage,
  createSubagentUsageSink: jest.fn().mockReturnValue(jest.fn()),
  resolveAgentTokenConfig: jest.fn(({ agentId, byAgentId, fallback }) =>
    agentId != null && byAgentId?.has(agentId) ? byAgentId.get(agentId) : fallback,
  ),
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
  findPiiMatchInMessages: jest.fn().mockReturnValue(null),
  discoverConnectedAgents: jest.fn().mockResolvedValue({
    agentConfigs: new Map(),
    edges: [],
    skippedAgentIds: new Set(),
    userMCPAuthMap: undefined,
  }),
  resolveSubagentGraphs: jest.fn().mockResolvedValue(undefined),
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

jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/agents/skillDeps', () => ({
  getSkillToolDeps: mockGetSkillToolDeps,
  getSkillDbMethods: jest.fn(() => ({})),
  canAuthorSkillFiles: mockCanAuthorSkillFiles,
  withDeploymentSkillIds: jest.fn((ids = []) => ids),
  enrichWithSkillConfigurable: mockEnrichWithSkillConfigurable,
  buildSkillPrimedIdsByName: mockBuildSkillPrimedIdsByName,
  buildAgentToolContext: mockBuildAgentToolContext,
  resolveMemoryAvailability: mockResolveMemoryAvailability,
  enrichLoadedToolsWithAgentContext: mockEnrichLoadedToolsWithAgentContext,
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/server/services/ToolService', () => ({
  loadAgentTools: jest.fn().mockResolvedValue([]),
  loadToolsForExecution: jest.fn().mockResolvedValue([]),
  isFatalAgentInitializationError: (error) =>
    ['AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE', 'resource_recovery_required'].includes(error?.code),
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
  getAgent: jest.fn().mockResolvedValue({ id: 'agent-123', name: 'Test Agent' }),
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
  getFormattedMemories: jest.fn().mockResolvedValue({ withKeys: '', withoutKeys: '' }),
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

  it('resolves saved graph subagents for remote chat-completion runs', async () => {
    const {
      initializeAgent,
      resolveSubagentGraphs,
      createSubagentUsageSink,
    } = require('@librechat/api');
    const primaryConfig = {
      id: 'agent-123',
      model: 'gpt-4',
      endpointTokenConfig: { 'gpt-4': { prompt: 1 } },
      model_parameters: {},
      toolRegistry: {},
      edges: [],
      subagents: {
        enabled: true,
        graphs: [{ type: 'team', agent_ids: ['agent-123'], edges: [] }],
      },
    };
    initializeAgent.mockResolvedValueOnce(primaryConfig);
    const memberTokenConfig = { 'custom-model': { prompt: 7 } };
    const memberConfig = {
      id: 'agent-graph-member',
      endpointTokenConfig: memberTokenConfig,
      agentContextAttachments: [{ file_id: 'member-file' }],
    };
    resolveSubagentGraphs.mockImplementationOnce(async ({ rootConfigs }, deps) => {
      rootConfigs[0].subagentGraphConfigs = [
        { definition: { type: 'team' }, memberConfigs: [memberConfig] },
      ];
      deps.onAgentInitialized('agent-graph-member', { id: 'agent-graph-member' }, memberConfig);
    });
    req.config.endpoints.agents.capabilities = ['subagents'];

    await OpenAIChatCompletionController(req, res);

    expect(resolveSubagentGraphs).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryConfig,
        rootConfigs: [primaryConfig],
        resourceType: ResourceType.REMOTE_AGENT,
        memoryAvailable: true,
      }),
      expect.objectContaining({ getAgent: expect.any(Function) }),
    );
    const usageParams = mockRecordCollectedUsage.mock.calls[0][1];
    expect(usageParams.endpointTokenConfig).toBe(primaryConfig.endpointTokenConfig);
    expect(usageParams.resolveEndpointTokenConfig({ agentId: 'agent-graph-member' })).toBe(
      memberTokenConfig,
    );
    expect(mockResolveMemoryAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ enabledCapabilities: expect.any(Set), user: req.user }),
    );
    expect(mockBuildAgentContextAttachmentsByAgentId).toHaveBeenCalledWith([
      primaryConfig,
      memberConfig,
    ]);
    expect(mockBuildAgentScopedContext).toHaveBeenCalledWith(
      expect.objectContaining({ agentIds: ['agent-123', 'agent-graph-member'] }),
    );
    expect(mockApplyContextToAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agent: memberConfig, agentId: 'agent-graph-member' }),
    );
    expect(mockBuildInlineMemoryContext).toHaveBeenCalledWith(
      expect.objectContaining({ agent: memberConfig, memoryAvailable: true }),
    );
    const { createRun } = require('@librechat/api');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ initialSessions: mockInitialSessions }),
    );
    expect(createSubagentUsageSink).toHaveBeenCalledWith(expect.any(Array), expect.any(Function));
    const aggregator =
      require('@librechat/api').createOpenAIContentAggregator.mock.results.at(-1).value;
    const initialPromptTokens = aggregator.usage.promptTokens;
    const initialCompletionTokens = aggregator.usage.completionTokens;
    const onSubagentUsage = createSubagentUsageSink.mock.calls.at(-1)[1];
    onSubagentUsage({ input_tokens: 25, output_tokens: 10 });
    expect(aggregator.usage.promptTokens).toBe(initialPromptTokens + 25);
    expect(aggregator.usage.completionTokens).toBe(initialCompletionTokens + 10);
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

  describe('remote-agent file authorization', () => {
    it('threads the remote-agent permission boundary through initialization and tool loading', async () => {
      const { initializeAgent, createToolExecuteHandler } = require('@librechat/api');
      const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
      const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');

      await OpenAIChatCompletionController(req, res);

      const [initializeParams, dbMethods] = initializeAgent.mock.calls.at(-1);
      const filterParams = {
        files: [{ file_id: 'owner-file', user: 'agent-owner' }],
        userId: 'user-123',
        role: 'USER',
        agentId: 'agent-123',
      };
      await dbMethods.filterFilesByAgentAccess(filterParams);
      expect(filterFilesByAgentAccess).toHaveBeenLastCalledWith({
        ...filterParams,
        resourceType: ResourceType.REMOTE_AGENT,
      });

      await initializeParams.loadTools({
        agentId: 'agent-123',
        tools: ['file_search'],
        provider: 'openAI',
        model: 'gpt-4',
        tool_resources: { file_search: { file_ids: ['owner-file'] } },
      });
      expect(loadAgentTools).toHaveBeenLastCalledWith(
        expect.objectContaining({ agentResourceType: ResourceType.REMOTE_AGENT }),
      );

      const toolExecuteOptions = createToolExecuteHandler.mock.calls.at(-1)[0];
      await toolExecuteOptions.loadTools(['file_search'], 'agent-123');
      expect(loadToolsForExecution).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agentResourceType: ResourceType.REMOTE_AGENT,
          requestBody: initializeParams.requestBody,
        }),
      );
    });

    it('returns 503 when an agent expects MCP tools but resolves none', async () => {
      const { initializeAgent } = require('@librechat/api');
      const { loadAgentTools } = require('~/server/services/ToolService');
      const toolError = Object.assign(new Error('Expected MCP tools are unavailable'), {
        code: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
        status: 503,
        statusCode: 503,
      });
      loadAgentTools.mockRejectedValueOnce(toolError);
      initializeAgent.mockImplementationOnce(async ({ req, res, loadTools, agent }) => {
        await loadTools({
          req,
          res,
          tools: ['run_query_mcp_warehouse'],
          model: agent.model,
          agentId: agent.id,
          provider: agent.provider,
        });
      });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns the resource recovery status and code before model invocation', async () => {
      const { createErrorResponse, initializeAgent } = require('@librechat/api');
      const { loadAgentTools } = require('~/server/services/ToolService');
      const toolError = Object.assign(new Error('resource recovery required'), {
        code: ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
        status: 409,
        statusCode: 409,
      });
      loadAgentTools.mockRejectedValueOnce(toolError);
      initializeAgent.mockImplementationOnce(async ({ req, res, loadTools, agent }) => {
        await loadTools({
          req,
          res,
          tools: ['execute_code'],
          model: agent.model,
          agentId: agent.id,
          provider: agent.provider,
        });
      });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createErrorResponse).toHaveBeenCalledWith(
        'resource recovery required',
        'invalid_request_error',
        ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
      );
    });
  });

  describe('execution envelope', () => {
    it('creates the portable run input before agent initialization', async () => {
      req.user = {
        id: 'user-123',
        role: 'USER',
        tenantId: 'tenant-123',
        federatedTokens: { access_token: 'secret' },
      };
      const requestBody = {
        ...req.body,
        ephemeralAgent: { skills: true },
        manualSkills: ['review-code'],
        timezone: 'America/New_York',
      };
      req.body = requestBody;
      const { validateRequest, initializeAgent } = require('@librechat/api');
      validateRequest.mockReturnValueOnce({ request: requestBody });

      await OpenAIChatCompletionController(req, res);

      expect(mockCreateAgentRunEnvelope).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'chat.completions',
          principal: req.user,
          payload: requestBody,
          requestId: expect.any(String),
          receivedAt: expect.any(Number),
        }),
      );
      expect(mockCreateAgentRunEnvelope.mock.invocationCallOrder[0]).toBeLessThan(
        initializeAgent.mock.invocationCallOrder[0],
      );
      expect(req.body).not.toBe(requestBody);
      expect(req.body).toEqual(requestBody);
      expect(JSON.stringify(mockCreateAgentRunEnvelope.mock.results[0].value)).not.toContain(
        'secret',
      );
    });

    it('returns a protocol 400 when the envelope rejects a non-JSON payload', async () => {
      const message = 'payload.max_tokens must contain only finite numbers';
      const { createErrorResponse, initializeAgent } = require('@librechat/api');
      mockCreateAgentRunEnvelope.mockImplementationOnce(() => {
        throw new MockAgentRunEnvelopeError(message);
      });

      await OpenAIChatCompletionController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(createErrorResponse).toHaveBeenCalledWith(message, 'invalid_request_error', null);
      expect(initializeAgent).not.toHaveBeenCalled();
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
    it('threads the OpenAI parent message id through both MCP execution bodies', async () => {
      const { validateRequest, createRun, initializeAgent } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          messages: [],
          stream: false,
          conversation_id: 'conversation-123',
          parent_message_id: 'parent-123',
        },
      });
      getConvo.mockResolvedValueOnce({ conversationId: 'conversation-123', user: 'user-123' });

      await OpenAIChatCompletionController(req, res);

      expect(initializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            messageId: 'chatcmpl-mock-nanoid-123',
            conversationId: 'conversation-123',
            parentMessageId: 'parent-123',
          },
        }),
        expect.anything(),
      );
      expect(createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            messageId: 'chatcmpl-mock-nanoid-123',
            conversationId: 'conversation-123',
            parentMessageId: 'parent-123',
          },
        }),
      );
      expect(mockProcessStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          configurable: expect.objectContaining({
            requestBody: {
              messageId: 'chatcmpl-mock-nanoid-123',
              conversationId: 'conversation-123',
              parentMessageId: 'parent-123',
            },
          }),
        }),
        expect.anything(),
      );
    });

    it('does not synthesize an MCP parent for a continuation that omits it', async () => {
      const { validateRequest, initializeAgent } = require('@librechat/api');
      const { getConvo } = require('~/models');
      validateRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          messages: [],
          stream: false,
          conversation_id: 'conversation-123',
        },
      });
      getConvo.mockResolvedValueOnce({ conversationId: 'conversation-123', user: 'user-123' });

      await OpenAIChatCompletionController(req, res);

      const requestBody = initializeAgent.mock.calls.at(-1)[0].requestBody;
      expect(requestBody).toEqual({
        messageId: 'chatcmpl-mock-nanoid-123',
        conversationId: 'conversation-123',
      });
      expect(requestBody).not.toHaveProperty('parentMessageId');
    });

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

  describe('sub-agent skill priming', () => {
    it('passes the sub-agent primed skill IDs into tool execution', async () => {
      const {
        initializeAgent,
        discoverConnectedAgents,
        createToolExecuteHandler,
      } = require('@librechat/api');
      const { loadToolsForExecution } = require('~/server/services/ToolService');
      const subAgent = { id: 'agent-sub', name: 'Sub Agent' };
      const subConfig = {
        id: 'agent-sub',
        model: 'gpt-4',
        model_parameters: {},
        toolRegistry: new Map(),
        userMCPAuthMap: { sub: { token: 'sub-token' } },
        tool_resources: { code_interpreter: { file_ids: ['sub-file'] } },
        actionsEnabled: true,
        accessibleSkillIds: ['sub-skill-id'],
        activeSkillNames: ['sub-hidden-skill'],
        codeEnvAvailable: true,
        skillAuthoringAvailable: true,
        fileAuthoringToolNames: ['create_file', 'edit_file'],
        manualSkillPrimes: [{ name: 'sub-hidden-skill', _id: { toString: () => 'sub-manual-id' } }],
        alwaysApplySkillPrimes: [
          { name: 'sub-always-skill', _id: { toString: () => 'sub-always-id' } },
        ],
      };

      initializeAgent.mockResolvedValueOnce({
        id: 'agent-123',
        model: 'gpt-4',
        model_parameters: {},
        toolRegistry: new Map(),
        edges: [{ source: 'agent-123', target: 'agent-sub' }],
        accessibleSkillIds: ['primary-skill-id'],
        activeSkillNames: ['primary-skill'],
        codeEnvAvailable: false,
        skillAuthoringAvailable: false,
        fileAuthoringToolNames: [],
        manualSkillPrimes: [{ name: 'primary-skill', _id: { toString: () => 'primary-skill-id' } }],
      });
      discoverConnectedAgents.mockImplementationOnce(async (_params, deps) => {
        deps.onAgentInitialized('agent-sub', subAgent, subConfig);
        return {
          agentConfigs: new Map([['agent-sub', subConfig]]),
          edges: [],
          skippedAgentIds: new Set(),
          userMCPAuthMap: undefined,
        };
      });

      await OpenAIChatCompletionController(req, res);

      const toolExecuteOptions = createToolExecuteHandler.mock.calls.at(-1)[0];
      await toolExecuteOptions.loadTools(['read_file'], 'agent-sub');

      expect(loadToolsForExecution).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agent: subAgent,
          toolRegistry: subConfig.toolRegistry,
          userMCPAuthMap: subConfig.userMCPAuthMap,
          tool_resources: subConfig.tool_resources,
          actionsEnabled: true,
        }),
      );
      expect(mockEnrichWithSkillConfigurable).toHaveBeenLastCalledWith({
        result: expect.anything(),
        context: {
          req,
          accessibleSkillIds: ['sub-skill-id'],
          codeEnvAvailable: true,
          skillPrimedIdsByName: {
            'sub-always-skill': 'sub-always-id',
            'sub-hidden-skill': 'sub-manual-id',
          },
          activeSkillNames: ['sub-hidden-skill'],
          skillAuthoringAvailable: true,
          fileAuthoringToolNames: ['create_file', 'edit_file'],
        },
      });
    });
  });
});
