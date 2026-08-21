/**
 * Unit tests for Open Responses API controller
 * Tests that recordCollectedUsage is called correctly for token spending
 */

const { ErrorTypes, ResourceType } = require('librechat-data-provider');

const mockSpendTokens = jest.fn().mockResolvedValue({});
const mockSpendStructuredTokens = jest.fn().mockResolvedValue({});
const mockRecordCollectedUsage = jest
  .fn()
  .mockResolvedValue({ input_tokens: 100, output_tokens: 50 });
const mockGetBalanceConfig = jest.fn().mockReturnValue({ enabled: true });
const mockGetTransactionsConfig = jest.fn().mockReturnValue({ enabled: true });
const mockResolveMemoryAvailability = jest.fn().mockResolvedValue(true);
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
const mockBuildAgentScopedContext = jest.fn().mockResolvedValue(new Map());
const mockBuildAgentContextAttachmentsByAgentId = jest.fn().mockReturnValue(new Map());
const mockBuildInlineMemoryContext = jest.fn().mockResolvedValue('');
const mockApplyContextToAgent = jest.fn().mockResolvedValue(undefined);

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
  /** Pass-through: the controller strips UI-only activity-label parts
   *  before SDK formatting; the mock must expose it like any other used
   *  export or the call throws before the assertions run. */
  stripActivityLabelParts: jest.fn((payload) => payload),
  createRun: jest.fn().mockResolvedValue({
    processStream: jest.fn().mockResolvedValue(undefined),
  }),
  buildInitialToolSessions: jest.fn().mockReturnValue(mockInitialSessions),
  applyContextToAgent: (...args) => mockApplyContextToAgent(...args),
  buildToolSet: jest.fn().mockReturnValue(new Set()),
  AgentRunEnvelopeError: MockAgentRunEnvelopeError,
  createAgentRunEnvelope: (...args) => mockCreateAgentRunEnvelope(...args),
  createMCPRuntimeRequestBody: ({ messageId, conversationId, parentMessageId }) => ({
    messageId,
    conversationId,
    ...(parentMessageId !== undefined && {
      parentMessageId: parentMessageId ?? '00000000-0000-0000-0000-000000000000',
    }),
  }),
  buildAgentScopedContext: (...args) => mockBuildAgentScopedContext(...args),
  buildInlineMemoryContext: (...args) => mockBuildInlineMemoryContext(...args),
  buildAgentContextAttachmentsByAgentId: (...args) =>
    mockBuildAgentContextAttachmentsByAgentId(...args),
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
  discoverConnectedAgents: jest.fn().mockImplementation(async (computedParams, deps) => {
    // Call onAgentInitialized for each agent config if provided by the mock setup
    if (deps?.onAgentInitialized && mockGlobalDiscoveredAgentConfigs) {
      for (const [agentId, config] of mockGlobalDiscoveredAgentConfigs) {
        deps.onAgentInitialized(agentId, config, config);
      }
    }
    return {
      agentConfigs: mockGlobalDiscoveredAgentConfigs ?? new Map(),
      edges: [],
      skippedAgentIds: new Set(),
      userMCPAuthMap: undefined,
    };
  }),
  resolveSubagentGraphs: jest.fn().mockResolvedValue(undefined),
  getBalanceConfig: mockGetBalanceConfig,
  getTransactionsConfig: mockGetTransactionsConfig,
  recordCollectedUsage: mockRecordCollectedUsage,
  createSubagentUsageSink: jest.fn().mockReturnValue(jest.fn()),
  CHILD_THREAD_READ_ONLY_ERROR:
    'This subagent thread is view-only. Continue it from its parent agent or create a separate chat.',
  getLangfuseTraceMessageFields: jest.fn().mockResolvedValue({
    langfuseSampled: true,
    langfuseDestinationIds: ['destination-1'],
  }),
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
  createToolExecuteHandler: jest.fn().mockReturnValue({ handle: jest.fn() }),
  // Responses API
  writeDone: jest.fn(),
  buildResponse: jest.fn().mockReturnValue({ id: 'resp_123', output: [] }),
  generateResponseId: jest.fn().mockReturnValue('resp_mock-123'),
  isValidationFailure: jest.fn().mockReturnValue(false),
  findPiiMatchInMessages: jest.fn().mockReturnValue(null),
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
  isFatalAgentInitializationError: (error) =>
    ['AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE', 'resource_recovery_required'].includes(error?.code),
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
  getFormattedMemories: jest.fn().mockResolvedValue({ withKeys: '', withoutKeys: '' }),
  saveConvo: jest.fn().mockResolvedValue({}),
  getConvo: jest.fn().mockResolvedValue(null),
}));

let mockGlobalDiscoveredAgentConfigs = null;

describe('createResponse controller', () => {
  let createResponse;
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGlobalDiscoveredAgentConfigs = null;

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

  it('resolves saved graph subagents for remote Responses API runs', async () => {
    const { initializeAgent, resolveSubagentGraphs } = require('@librechat/api');
    const primaryConfig = {
      id: 'agent-123',
      model: 'claude-3',
      endpointTokenConfig: { 'claude-3': { prompt: 1 } },
      model_parameters: {},
      toolRegistry: {},
      edges: [],
      agentContextAttachments: [],
      subagents: {
        enabled: true,
        graphs: [{ type: 'team', agent_ids: ['agent-123'], edges: [] }],
      },
    };
    initializeAgent.mockResolvedValueOnce(primaryConfig);
    const memberConfig = {
      id: 'agent-graph-member',
      endpointTokenConfig: { 'custom-model': { prompt: 7 } },
      agentContextAttachments: [{ file_id: 'member-file' }],
    };
    resolveSubagentGraphs.mockImplementationOnce(async ({ rootConfigs }, deps) => {
      rootConfigs[0].subagentGraphConfigs = [
        { definition: { type: 'team' }, memberConfigs: [memberConfig] },
      ];
      deps.onAgentInitialized(memberConfig.id, memberConfig, memberConfig);
    });
    req.config.endpoints.agents.capabilities = ['subagents'];

    await createResponse(req, res);

    expect(resolveSubagentGraphs).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryConfig,
        rootConfigs: [primaryConfig],
        resourceType: ResourceType.REMOTE_AGENT,
        memoryAvailable: true,
      }),
      expect.objectContaining({ getAgent: expect.any(Function) }),
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
    const usageParams = mockRecordCollectedUsage.mock.calls[0][1];
    expect(usageParams.endpointTokenConfig).toBe(primaryConfig.endpointTokenConfig);
    expect(usageParams.resolveEndpointTokenConfig({ agentId: memberConfig.id })).toBe(
      memberConfig.endpointTokenConfig,
    );
    expect(mockResolveMemoryAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ enabledCapabilities: expect.any(Set), user: req.user }),
    );
    const { createRun } = require('@librechat/api');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ initialSessions: mockInitialSessions }),
    );
  });

  it('returns 503 when an agent expects MCP tools but resolves none', async () => {
    const { initializeAgent, sendResponsesErrorResponse } = require('@librechat/api');
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

    await createResponse(req, res);

    expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
      res,
      503,
      'Expected MCP tools are unavailable',
      'server_error',
      'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
    );
  });

  it('returns the resource recovery status and code before model invocation', async () => {
    const { initializeAgent, sendResponsesErrorResponse } = require('@librechat/api');
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

    await createResponse(req, res);

    expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
      res,
      409,
      'resource recovery required',
      'invalid_request',
      ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
    );
  });

  it('stores Langfuse trace markers with a persisted response', async () => {
    const api = require('@librechat/api');
    const { saveMessage } = require('~/models');
    api.validateResponseRequest.mockReturnValueOnce({
      request: { ...req.body, store: true },
    });

    await createResponse(req, res);

    expect(api.getLangfuseTraceMessageFields).toHaveBeenCalledWith(req.config, 'resp_mock-123');
    expect(saveMessage).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        messageId: 'resp_mock-123',
        isCreatedByUser: false,
        langfuseSampled: true,
        langfuseDestinationIds: ['destination-1'],
      }),
      { context: 'Responses API - save assistant response' },
    );
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
        isTemporary: true,
      };
      req.body = requestBody;
      const { validateResponseRequest, initializeAgent } = require('@librechat/api');
      validateResponseRequest.mockReturnValueOnce({ request: requestBody });

      await createResponse(req, res);

      expect(mockCreateAgentRunEnvelope).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol: 'responses',
          principal: req.user,
          payload: requestBody,
          requestId: expect.any(String),
          receivedAt: expect.any(Number),
        }),
      );
      expect(mockCreateAgentRunEnvelope.mock.invocationCallOrder[0]).toBeLessThan(
        initializeAgent.mock.invocationCallOrder[0],
      );
      expect(initializeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: {
            messageId: 'resp_mock-123',
            conversationId: expect.any(String),
          },
        }),
        expect.anything(),
      );
      expect(req.body).not.toBe(requestBody);
      expect(req.body).toEqual(requestBody);
      expect(JSON.stringify(mockCreateAgentRunEnvelope.mock.results[0].value)).not.toContain(
        'secret',
      );
    });

    it('returns a protocol 400 when the envelope rejects a non-JSON payload', async () => {
      const message = 'payload.max_output_tokens must contain only finite numbers';
      const { sendResponsesErrorResponse, initializeAgent } = require('@librechat/api');
      mockCreateAgentRunEnvelope.mockImplementationOnce(() => {
        throw new MockAgentRunEnvelopeError(message);
      });

      await createResponse(req, res);

      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(res, 400, message, 'invalid_request');
      expect(initializeAgent).not.toHaveBeenCalled();
    });
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

    it('rejects a remote response continuation of a view-only subagent thread', async () => {
      const {
        validateResponseRequest,
        sendResponsesErrorResponse,
        CHILD_THREAD_READ_ONLY_ERROR,
      } = require('@librechat/api');
      const { getConvo, saveConvo, saveMessage } = require('~/models');
      validateResponseRequest.mockReturnValueOnce({
        request: {
          model: 'agent-123',
          input: 'Mutate the child.',
          stream: false,
          store: true,
          previous_response_id: 'child-thread',
        },
      });
      getConvo.mockResolvedValueOnce({
        conversationId: 'child-thread',
        user: 'user-123',
        subagentThread: { parentConversationId: 'parent-thread' },
      });

      await createResponse(req, res);

      expect(sendResponsesErrorResponse).toHaveBeenCalledWith(
        res,
        409,
        CHILD_THREAD_READ_ONLY_ERROR,
        'invalid_request',
        'conversation_read_only',
      );
      expect(saveConvo).not.toHaveBeenCalled();
      expect(saveMessage).not.toHaveBeenCalled();
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

  describe('remote-agent file authorization', () => {
    it('threads the remote-agent permission boundary through initialization and tool loading', async () => {
      const { initializeAgent, createToolExecuteHandler } = require('@librechat/api');
      const { loadAgentTools, loadToolsForExecution } = require('~/server/services/ToolService');
      const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');

      await createResponse(req, res);

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
        provider: 'anthropic',
        model: 'claude-3',
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

  describe('agent context parity with UI path', () => {
    it('applies agent-scoped attachment context before createRun', async () => {
      const api = require('@librechat/api');
      api.initializeAgent.mockResolvedValueOnce({
        id: 'agent-123',
        model: 'claude-3',
        model_parameters: {},
        toolRegistry: {},
        edges: [],
        agentContextAttachments: [{ file_id: 'file-1', filename: 'ocr_file.pdf' }],
      });
      mockBuildAgentContextAttachmentsByAgentId.mockReturnValueOnce(
        new Map([['agent-123', [{ file_id: 'file-1', filename: 'ocr_file.pdf' }]]]),
      );
      mockBuildAgentScopedContext.mockResolvedValueOnce(
        new Map([['agent-123', 'PDF context: ocr_file.pdf']]),
      );

      await createResponse(req, res);

      expect(mockBuildAgentContextAttachmentsByAgentId).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'agent-123' }),
      ]);
      expect(mockBuildAgentScopedContext).toHaveBeenCalledWith(
        expect.objectContaining({
          agentIds: ['agent-123'],
          attachmentsByAgentId: expect.any(Map),
          req,
        }),
      );
      expect(mockApplyContextToAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: expect.objectContaining({ id: 'agent-123' }),
          agentId: 'agent-123',
          sharedRunContext: 'PDF context: ocr_file.pdf',
        }),
      );
    });

    it('applies context to primary and discovered handoff agents', async () => {
      const api = require('@librechat/api');
      const handoffConfig = {
        id: 'agent-handoff',
        model: 'claude-3',
        model_parameters: {},
        toolRegistry: {},
        edges: [],
        agentContextAttachments: [{ file_id: 'file-2', filename: 'handoff_context.pdf' }],
      };

      // Set primary agent to have edges pointing to handoff agent
      api.initializeAgent.mockResolvedValueOnce({
        id: 'agent-123',
        model: 'claude-3',
        model_parameters: {},
        toolRegistry: {},
        edges: [{ source: 'agent-123', target: 'agent-handoff' }],
        agentContextAttachments: [{ file_id: 'file-1', filename: 'primary_context.pdf' }],
      });

      // Set global config so discoverConnectedAgents mock can invoke onAgentInitialized
      mockGlobalDiscoveredAgentConfigs = new Map([['agent-handoff', handoffConfig]]);

      mockBuildAgentScopedContext.mockResolvedValueOnce(
        new Map([
          ['agent-123', 'Primary context'],
          ['agent-handoff', 'Handoff context'],
        ]),
      );

      await createResponse(req, res);

      const appliedAgentIds = mockApplyContextToAgent.mock.calls.map((call) => call[0].agentId);
      expect(appliedAgentIds).toEqual(expect.arrayContaining(['agent-123', 'agent-handoff']));
      expect(mockApplyContextToAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-handoff',
          sharedRunContext: 'Handoff context',
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

    it('adds subagent usage to the response usage handler', async () => {
      const api = require('@librechat/api');

      await createResponse(req, res);

      const onSubagentUsage = api.createSubagentUsageSink.mock.calls.at(-1)[1];
      const aggregatorHandlers =
        api.createAggregatorEventHandlers.mock.results.at(-1)?.value ??
        api.createResponsesEventHandlers.mock.results.at(-1)?.value.handlers;
      onSubagentUsage({ input_tokens: 25, output_tokens: 10 });

      expect(aggregatorHandlers.on_chat_model_end.handle).toHaveBeenCalledWith(
        'on_chat_model_end',
        {
          output: { usage_metadata: { input_tokens: 25, output_tokens: 10 } },
        },
      );
    });
  });

  describe('sub-agent skill priming', () => {
    it('passes the sub-agent primed skill IDs into non-streaming tool execution', async () => {
      const {
        initializeAgent,
        discoverConnectedAgents,
        createToolExecuteHandler,
      } = require('@librechat/api');
      const { loadToolsForExecution } = require('~/server/services/ToolService');
      const subAgent = { id: 'agent-sub', name: 'Sub Agent' };
      const subConfig = {
        id: 'agent-sub',
        model: 'claude-3',
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
        model: 'claude-3',
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

      await createResponse(req, res);

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
