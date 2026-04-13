const {
  Tools,
  Constants,
  EModelEndpoint,
  isActionTool,
  actionDelimiter,
  AgentCapabilities,
  defaultAgentCapabilities,
} = require('librechat-data-provider');

const mockGetEndpointsConfig = jest.fn();
const mockGetMCPServerTools = jest.fn();
const mockGetCachedTools = jest.fn();
jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: (...args) => mockGetEndpointsConfig(...args),
  getMCPServerTools: (...args) => mockGetMCPServerTools(...args),
  getCachedTools: (...args) => mockGetCachedTools(...args),
}));

const mockLoadToolDefinitions = jest.fn();
const mockGetUserMCPAuthMap = jest.fn();
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  loadToolDefinitions: (...args) => mockLoadToolDefinitions(...args),
  getUserMCPAuthMap: (...args) => mockGetUserMCPAuthMap(...args),
}));

const mockLoadToolsUtil = jest.fn();
jest.mock('~/app/clients/tools/util', () => ({
  loadTools: (...args) => mockLoadToolsUtil(...args),
}));

const mockLoadActionSets = jest.fn();
const mockDomainParser = jest.fn();
const mockLegacyDomainEncode = jest.fn();
const mockDecryptMetadata = jest.fn();
const mockCreateActionTool = jest.fn();
jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn().mockResolvedValue({}),
}));
jest.mock('~/server/services/Tools/search', () => ({
  createOnSearchResults: jest.fn(),
}));
jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));
jest.mock('~/server/services/Files/process', () => ({
  processFileURL: jest.fn(),
  uploadImageBuffer: jest.fn(),
}));
jest.mock('~/app/clients/tools/util/fileSearch', () => ({
  primeFiles: jest.fn().mockResolvedValue({}),
}));
jest.mock('~/server/services/Files/Code/process', () => ({
  primeFiles: jest.fn().mockResolvedValue({}),
}));
jest.mock('../ActionService', () => ({
  loadActionSets: (...args) => mockLoadActionSets(...args),
  decryptMetadata: (...args) => mockDecryptMetadata(...args),
  createActionTool: (...args) => mockCreateActionTool(...args),
  domainParser: (...args) => mockDomainParser(...args),
  legacyDomainEncode: (...args) => mockLegacyDomainEncode(...args),
}));
jest.mock('~/server/services/Threads', () => ({
  recordUsage: jest.fn(),
}));
jest.mock('~/models', () => ({
  findPluginAuthsByKeys: jest.fn(),
}));
jest.mock('~/config', () => ({
  getFlowStateManager: jest.fn(() => ({})),
}));
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn().mockResolvedValue({}),
}));
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({})),
}));

const {
  loadAgentTools,
  loadToolsForExecution,
  processRequiredActions,
  resolveAgentCapabilities,
} = require('../ToolService');

function createMockReq(capabilities) {
  return {
    user: { id: 'user_123' },
    config: {
      endpoints: {
        [EModelEndpoint.agents]: {
          capabilities,
        },
      },
    },
  };
}

function createEndpointsConfig(capabilities) {
  return {
    [EModelEndpoint.agents]: { capabilities },
  };
}

describe('ToolService - Action Capability Gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadToolDefinitions.mockResolvedValue({
      toolDefinitions: [],
      toolRegistry: new Map(),
      hasDeferredTools: false,
    });
    mockLoadToolsUtil.mockResolvedValue({ loadedTools: [], toolContextMap: {} });
    mockLoadActionSets.mockResolvedValue([]);
  });

  describe('resolveAgentCapabilities', () => {
    it('should return capabilities from endpoints config', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await resolveAgentCapabilities(req, req.config, 'agent_123');

      expect(result).toBeInstanceOf(Set);
      expect(result.has(AgentCapabilities.tools)).toBe(true);
      expect(result.has(AgentCapabilities.actions)).toBe(true);
      expect(result.has(AgentCapabilities.web_search)).toBe(false);
    });

    it('should fall back to default capabilities for ephemeral agents with empty config', async () => {
      const req = createMockReq(defaultAgentCapabilities);
      mockGetEndpointsConfig.mockResolvedValue({});

      const result = await resolveAgentCapabilities(req, req.config, Constants.EPHEMERAL_AGENT_ID);

      for (const cap of defaultAgentCapabilities) {
        expect(result.has(cap)).toBe(true);
      }
    });

    it('should return empty set when no capabilities and not ephemeral', async () => {
      const req = createMockReq([]);
      mockGetEndpointsConfig.mockResolvedValue({});

      const result = await resolveAgentCapabilities(req, req.config, 'agent_123');

      expect(result.size).toBe(0);
    });
  });

  describe('isActionTool — cross-delimiter collision guard', () => {
    it('should identify real action tools', () => {
      expect(isActionTool(`get_weather${actionDelimiter}api_example_com`)).toBe(true);
      expect(isActionTool(`fetch_data${actionDelimiter}my---domain---com`)).toBe(true);
    });

    it('should identify action tools whose operationId contains _mcp_', () => {
      expect(isActionTool(`sync_mcp_state${actionDelimiter}api---example---com`)).toBe(true);
      expect(isActionTool(`get_mcp_config${actionDelimiter}internal---api---com`)).toBe(true);
    });

    it('should reject MCP tools whose name ends with _action', () => {
      expect(isActionTool(`get_action${Constants.mcp_delimiter}myserver`)).toBe(false);
      expect(isActionTool(`fetch_action${Constants.mcp_delimiter}server_name`)).toBe(false);
      expect(isActionTool(`retrieve_action${Constants.mcp_delimiter}srv`)).toBe(false);
    });

    it('should reject MCP tools with _action_ in the middle of their name', () => {
      expect(isActionTool(`get_action_data${Constants.mcp_delimiter}myserver`)).toBe(false);
      expect(isActionTool(`create_action_item${Constants.mcp_delimiter}server`)).toBe(false);
    });

    it('should reject tools without the action delimiter', () => {
      expect(isActionTool('calculator')).toBe(false);
      expect(isActionTool(`web_search${Constants.mcp_delimiter}myserver`)).toBe(false);
    });

    it('known limitation: non-RFC domain with _mcp_ substring yields false negative', () => {
      // RFC 952/1123 prohibit underscores in hostnames, so this is not expected in practice.
      // Encoded domain `api_mcp_internal_com` places `_mcp_` after `_action_`, which
      // the guard interprets as the MCP suffix.
      const edgeCaseTool = `getData${actionDelimiter}api_mcp_internal_com`;
      expect(isActionTool(edgeCaseTool)).toBe(false);
    });
  });

  describe('loadAgentTools (definitionsOnly=true) — action tool filtering', () => {
    const actionToolName = `get_weather${actionDelimiter}api_example_com`;
    const regularTool = 'calculator';

    it('should exclude action tools from definitions when actions capability is disabled', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.web_search];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, actionToolName] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain(regularTool);
      expect(callArgs.tools).not.toContain(actionToolName);
    });

    it('should include action tools in definitions when actions capability is enabled', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, actionToolName] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain(regularTool);
      expect(callArgs.tools).toContain(actionToolName);
    });

    it('should not filter MCP tools whose name contains _action (cross-delimiter collision)', async () => {
      const mcpToolWithAction = `get_action${Constants.mcp_delimiter}myserver`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, mcpToolWithAction] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain(mcpToolWithAction);
      expect(callArgs.tools).toContain(regularTool);
    });

    it('should return actionsEnabled in the result', async () => {
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool] },
        definitionsOnly: true,
      });

      expect(result.actionsEnabled).toBe(false);
    });
  });

  describe('loadAgentTools (definitionsOnly=false) — action tool filtering', () => {
    const actionToolName = `get_weather${actionDelimiter}api_example_com`;
    const regularTool = 'calculator';

    it('should not load action sets when actions capability is disabled', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.web_search];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, actionToolName] },
        definitionsOnly: false,
      });

      expect(mockLoadActionSets).not.toHaveBeenCalled();
    });

    it('should load action sets when actions capability is enabled and action tools present', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, actionToolName] },
        definitionsOnly: false,
      });

      expect(mockLoadActionSets).toHaveBeenCalledWith({ agent_id: 'agent_123' });
    });
  });

  describe('loadToolsForExecution — action tool gating', () => {
    const actionToolName = `get_weather${actionDelimiter}api_example_com`;
    const regularTool = Tools.web_search;

    it('should skip action tool loading when actionsEnabled=false', async () => {
      const req = createMockReq([]);
      req.config = {};

      const result = await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_123' },
        toolNames: [regularTool, actionToolName],
        actionsEnabled: false,
      });

      expect(mockLoadActionSets).not.toHaveBeenCalled();
      expect(result.loadedTools).toBeDefined();
    });

    it('should load action tools when actionsEnabled=true', async () => {
      const req = createMockReq([AgentCapabilities.actions]);
      req.config = {};

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_123' },
        toolNames: [actionToolName],
        actionsEnabled: true,
      });

      expect(mockLoadActionSets).toHaveBeenCalledWith({ agent_id: 'agent_123' });
    });

    it('should resolve actionsEnabled from capabilities when not explicitly provided', async () => {
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_123' },
        toolNames: [actionToolName],
      });

      expect(mockGetEndpointsConfig).toHaveBeenCalled();
      expect(mockLoadActionSets).not.toHaveBeenCalled();
    });

    it('should not call loadActionSets when there are no action tools', async () => {
      const req = createMockReq([AgentCapabilities.actions]);
      req.config = {};

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_123' },
        toolNames: [regularTool],
        actionsEnabled: true,
      });

      expect(mockLoadActionSets).not.toHaveBeenCalled();
    });
  });

  describe('checkCapability logic', () => {
    const createCheckCapability = (enabledCapabilities, logger = { warn: jest.fn() }) => {
      return (capability) => {
        const enabled = enabledCapabilities.has(capability);
        if (!enabled) {
          const isToolCapability = [
            AgentCapabilities.file_search,
            AgentCapabilities.execute_code,
            AgentCapabilities.web_search,
          ].includes(capability);
          const suffix = isToolCapability ? ' despite configured tool.' : '.';
          logger.warn(`Capability "${capability}" disabled${suffix}`);
        }
        return enabled;
      };
    };

    it('should return true when capability is enabled', () => {
      const enabledCapabilities = new Set([AgentCapabilities.deferred_tools]);
      const checkCapability = createCheckCapability(enabledCapabilities);

      expect(checkCapability(AgentCapabilities.deferred_tools)).toBe(true);
    });

    it('should return false when capability is not enabled', () => {
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities);

      expect(checkCapability(AgentCapabilities.deferred_tools)).toBe(false);
    });

    it('should log warning with "despite configured tool" for tool capabilities', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.file_search);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.execute_code);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.web_search);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('despite configured tool'));
    });

    it('should log warning without "despite configured tool" for non-tool capabilities', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.deferred_tools);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "deferred_tools" disabled.'),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('despite configured tool'),
      );

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.tools);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "tools" disabled.'),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('despite configured tool'),
      );

      logger.warn.mockClear();
      checkCapability(AgentCapabilities.actions);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Capability "actions" disabled.'),
      );
    });

    it('should not log warning when capability is enabled', () => {
      const logger = { warn: jest.fn() };
      const enabledCapabilities = new Set([
        AgentCapabilities.deferred_tools,
        AgentCapabilities.file_search,
      ]);
      const checkCapability = createCheckCapability(enabledCapabilities, logger);

      checkCapability(AgentCapabilities.deferred_tools);
      checkCapability(AgentCapabilities.file_search);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('defaultAgentCapabilities', () => {
    it('should include deferred_tools capability by default', () => {
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.deferred_tools);
    });

    it('should include all expected default capabilities', () => {
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.execute_code);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.file_search);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.web_search);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.artifacts);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.actions);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.context);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.tools);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.chain);
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.ocr);
    });
  });

  describe('userMCPAuthMap gating', () => {
    const shouldFetchMCPAuth = (tools) =>
      tools?.some((t) => t.includes(Constants.mcp_delimiter)) ?? false;

    it('should return true when agent has MCP tools', () => {
      const tools = ['web_search', `search${Constants.mcp_delimiter}my-mcp-server`, 'calculator'];
      expect(shouldFetchMCPAuth(tools)).toBe(true);
    });

    it('should return false when agent has no MCP tools', () => {
      const tools = ['web_search', 'calculator', 'code_interpreter'];
      expect(shouldFetchMCPAuth(tools)).toBe(false);
    });

    it('should return false when tools is empty', () => {
      expect(shouldFetchMCPAuth([])).toBe(false);
    });

    it('should return false when tools is undefined', () => {
      expect(shouldFetchMCPAuth(undefined)).toBe(false);
    });

    it('should return false when tools is null', () => {
      expect(shouldFetchMCPAuth(null)).toBe(false);
    });

    it('should detect MCP tools with different server names', () => {
      const tools = [
        `listFiles${Constants.mcp_delimiter}file-server`,
        `query${Constants.mcp_delimiter}db-server`,
      ];
      expect(shouldFetchMCPAuth(tools)).toBe(true);
    });

    it('should return true even when only one tool is MCP', () => {
      const tools = [
        'web_search',
        'calculator',
        'code_interpreter',
        `echo${Constants.mcp_delimiter}test-server`,
      ];
      expect(shouldFetchMCPAuth(tools)).toBe(true);
    });
  });

  describe('deferredToolsEnabled integration', () => {
    it('should correctly determine deferredToolsEnabled from capabilities set', () => {
      const createCheckCapability = (enabledCapabilities) => {
        return (capability) => enabledCapabilities.has(capability);
      };

      const withDeferred = new Set([AgentCapabilities.deferred_tools, AgentCapabilities.tools]);
      const checkWithDeferred = createCheckCapability(withDeferred);
      expect(checkWithDeferred(AgentCapabilities.deferred_tools)).toBe(true);

      const withoutDeferred = new Set([AgentCapabilities.tools, AgentCapabilities.actions]);
      const checkWithoutDeferred = createCheckCapability(withoutDeferred);
      expect(checkWithoutDeferred(AgentCapabilities.deferred_tools)).toBe(false);
    });

    it('should use defaultAgentCapabilities when no capabilities configured', () => {
      const endpointsConfig = {};
      const enabledCapabilities = new Set(
        endpointsConfig?.capabilities ?? defaultAgentCapabilities,
      );

      expect(enabledCapabilities.has(AgentCapabilities.deferred_tools)).toBe(true);
    });
  });

  describe('multi-action domain collision regression', () => {
    // Two distinct OpenAPI Actions whose `servers[0].url` resolves to the
    // same hostname must both contribute their tools to the agent. The
    // previous implementation indexed processed action sets by encoded
    // domain, so the second action overwrote the first in the map and one
    // action's tools silently disappeared from the LLM payload.
    //
    // The encoded domain we use as the lookup key for the action sets is
    // mocked to a fixed string for both actions to make the collision
    // condition deterministic without depending on the real base64
    // truncation rules.
    const SHARED_DOMAIN = 'https://api.example.com';
    const ENCODED_DOMAIN = 'shared_dom';
    const LEGACY_ENCODED_DOMAIN = 'legacy_dom';

    const buildSpec = (operationId, path) =>
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: `Mock ${operationId}`, version: '1.0.0' },
        servers: [{ url: SHARED_DOMAIN }],
        paths: {
          [path]: {
            get: {
              operationId,
              summary: `Mock ${operationId}`,
              responses: {
                200: {
                  description: 'OK',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              },
            },
          },
        },
      });

    const actionA = {
      action_id: 'action_a',
      metadata: {
        domain: SHARED_DOMAIN,
        raw_spec: buildSpec('echoMessage', '/echo'),
      },
    };
    const actionB = {
      action_id: 'action_b',
      metadata: {
        domain: SHARED_DOMAIN,
        raw_spec: buildSpec('listItems', '/items'),
      },
    };

    const toolNameA = `echoMessage${actionDelimiter}${ENCODED_DOMAIN}`;
    const toolNameB = `listItems${actionDelimiter}${ENCODED_DOMAIN}`;

    beforeEach(() => {
      // Both actions share a hostname → both call sites get the same encoded
      // value back. This is precisely the collision shape that triggered
      // the bug in production.
      mockDomainParser.mockResolvedValue(ENCODED_DOMAIN);
      mockLegacyDomainEncode.mockReturnValue(LEGACY_ENCODED_DOMAIN);
      mockDecryptMetadata.mockImplementation(async (metadata) => metadata);
      mockCreateActionTool.mockImplementation(async ({ name, requestBuilder }) => ({
        name,
        // Surface the request builder identity on the returned tool so
        // assertions can verify each tool was wired to the correct action's
        // builder, not its sibling's.
        _builder: requestBuilder,
        // Resolve instead of returning undefined — processRequiredActions
        // chains `.then(handleToolOutput)` directly onto this call, which
        // would throw synchronously on an undefined return and mask the
        // test as a simulated runtime crash.
        _call: jest.fn().mockResolvedValue('{"status":"ok"}'),
        schema: {},
        description: '',
      }));
    });

    const expectBothActionsResolved = (calls) => {
      const callsByName = new Map(calls.map((c) => [c[0].name, c[0]]));
      expect(callsByName.has(toolNameA)).toBe(true);
      expect(callsByName.has(toolNameB)).toBe(true);
      // Each tool's request builder must come from the matching action's
      // own parsed spec — not the sibling's. The previous bug would either
      // route both to the same action's builders (and drop one as
      // undefined) or silently skip one entirely.
      const builderA = callsByName.get(toolNameA).requestBuilder;
      const builderB = callsByName.get(toolNameB).requestBuilder;
      expect(builderA).toBeDefined();
      expect(builderB).toBeDefined();
      expect(builderA).not.toBe(builderB);
      // Each builder targets its own operation path — confirms the
      // request builder lookup didn't cross-contaminate between actions.
      expect(builderA.path).toBe('/echo');
      expect(builderB.path).toBe('/items');
    };

    it('loadAgentTools resolves both actions when they share a hostname', async () => {
      mockLoadActionSets.mockResolvedValue([actionA, actionB]);
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_collision', tools: [toolNameA, toolNameB] },
        definitionsOnly: false,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      expectBothActionsResolved(mockCreateActionTool.mock.calls);
    });

    it('loadAgentTools is order-invariant for two actions sharing a hostname', async () => {
      // Reverse the actionSets order — what used to flip the "winner" of
      // the encoded-domain Map overwrite must now make zero observable
      // difference.
      mockLoadActionSets.mockResolvedValue([actionB, actionA]);
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_collision', tools: [toolNameA, toolNameB] },
        definitionsOnly: false,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      expectBothActionsResolved(mockCreateActionTool.mock.calls);
    });

    it('loadToolsForExecution resolves both actions when they share a hostname', async () => {
      mockLoadActionSets.mockResolvedValue([actionA, actionB]);
      const req = createMockReq([AgentCapabilities.actions]);
      req.config = {};

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_collision' },
        toolNames: [toolNameA, toolNameB],
        actionsEnabled: true,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      expectBothActionsResolved(mockCreateActionTool.mock.calls);
    });

    it('processRequiredActions resolves both actions when they share a hostname', async () => {
      // The assistants/threads path received the same structural rewrite
      // as the agent paths. Cover it directly so future regressions in the
      // `toolToAction` map shape or the lookup normalization don't slip
      // through just because the agent-path tests still pass.
      mockLoadActionSets.mockResolvedValue([actionA, actionB]);
      const client = {
        req: {
          user: { id: 'user_123' },
          body: {
            assistant_id: 'assistant_collision',
            model: 'gpt-4o-mini',
            endpoint: 'openAI',
          },
          config: {},
        },
        res: {},
        apiKey: 'sk-test',
        mappedOrder: new Map(),
        seenToolCalls: new Map(),
        addContentData: jest.fn(),
      };

      await processRequiredActions(client, [
        {
          tool: toolNameA,
          toolInput: {},
          toolCallId: 'call_a',
          thread_id: 'thread_1',
          run_id: 'run_1',
        },
        {
          tool: toolNameB,
          toolInput: {},
          toolCallId: 'call_b',
          thread_id: 'thread_1',
          run_id: 'run_1',
        },
      ]);

      // The assistants path intentionally doesn't forward `name` to
      // createActionTool (see ToolService.js — "intentionally not passing
      // zodSchema, name, and description for assistants API"), so key
      // resolution assertions off the request builder path instead.
      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      const builderPaths = mockCreateActionTool.mock.calls.map((c) => c[0].requestBuilder?.path);
      expect(builderPaths).toEqual(expect.arrayContaining(['/echo', '/items']));
      // Each call must carry a distinct builder — guards against the bug
      // where the surviving action's builders got routed to every tool.
      expect(builderPaths[0]).not.toBe(builderPaths[1]);
    });

    it('loadAgentTools resolves legacy-format tool names via the legacy encoding branch', async () => {
      // Agents whose tool names predate the current domain encoding store
      // them under `legacyDomainEncode`'s output. The map registers both
      // encodings per function so these keep resolving after the fix;
      // this test exercises the `if (legacyNormalized !== normalizedDomain)`
      // branch, which was previously never hit by any test.
      mockLoadActionSets.mockResolvedValue([actionA]);
      const legacyToolName = `echoMessage${actionDelimiter}${LEGACY_ENCODED_DOMAIN}`;
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_legacy', tools: [legacyToolName] },
        definitionsOnly: false,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(1);
      const [callArgs] = mockCreateActionTool.mock.calls[0];
      expect(callArgs.name).toBe(legacyToolName);
      expect(callArgs.requestBuilder.path).toBe('/echo');
    });

    it('loadAgentTools distinguishes operationIds that differ only by `---` vs `_`', async () => {
      // `openapiToFunction` uses the user-supplied operationId verbatim
      // and only sanitizes the synthetic `<method>_<path>` fallback, and
      // `sanitizeOperationId` preserves `-`. So two operations whose
      // operationIds differ only by `---` vs `_` (e.g. `get_foo---bar`
      // and `get_foo_bar`) are legitimately distinct on the same spec —
      // or, here, on two actions sharing a hostname.
      //
      // Normalization must only touch the encoded-domain suffix after
      // `actionDelimiter`; if it also collapsed the operationId, both
      // tools would write to the same map slot and resolve to the
      // surviving entry's request builder.
      const hyphenSpec = {
        action_id: 'action_hyphen',
        metadata: {
          domain: SHARED_DOMAIN,
          raw_spec: buildSpec('get_foo---bar', '/foo-bar'),
        },
      };
      const underscoreSpec = {
        action_id: 'action_underscore',
        metadata: {
          domain: SHARED_DOMAIN,
          raw_spec: buildSpec('get_foo_bar', '/foo_bar'),
        },
      };
      mockLoadActionSets.mockResolvedValue([hyphenSpec, underscoreSpec]);

      const hyphenTool = `get_foo---bar${actionDelimiter}${ENCODED_DOMAIN}`;
      const underscoreTool = `get_foo_bar${actionDelimiter}${ENCODED_DOMAIN}`;
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_hyphen', tools: [hyphenTool, underscoreTool] },
        definitionsOnly: false,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      const callsByName = new Map(mockCreateActionTool.mock.calls.map((c) => [c[0].name, c[0]]));
      expect(callsByName.has(hyphenTool)).toBe(true);
      expect(callsByName.has(underscoreTool)).toBe(true);
      expect(callsByName.get(hyphenTool).requestBuilder.path).toBe('/foo-bar');
      expect(callsByName.get(underscoreTool).requestBuilder.path).toBe('/foo_bar');
      // Critical: the two must resolve to distinct builders. If the
      // operationId half of the key is normalized, both collapse to
      // the same map slot and one silently overwrites the other.
      expect(callsByName.get(hyphenTool).requestBuilder).not.toBe(
        callsByName.get(underscoreTool).requestBuilder,
      );
    });

    it('loadAgentTools resolves raw `---`-separated tool names from agent.tools', async () => {
      // Hostnames at or below ENCODED_DOMAIN_LENGTH round-trip through
      // `domainParser(..., true)` as a `---`-separated string, and agents
      // persist that raw form in `agent.tools`. The map is always keyed
      // with the `_`-collapsed form, so the lookup must normalize the
      // incoming name or short-hostname tools silently drop out.
      mockDomainParser.mockResolvedValue('shared---dom');
      mockLoadActionSets.mockResolvedValue([actionA, actionB]);
      const rawNameA = `echoMessage${actionDelimiter}shared---dom`;
      const rawNameB = `listItems${actionDelimiter}shared---dom`;
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.actions];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_short', tools: [rawNameA, rawNameB] },
        definitionsOnly: false,
      });

      expect(mockCreateActionTool).toHaveBeenCalledTimes(2);
      const callsByName = new Map(mockCreateActionTool.mock.calls.map((c) => [c[0].name, c[0]]));
      expect(callsByName.has(rawNameA)).toBe(true);
      expect(callsByName.has(rawNameB)).toBe(true);
      expect(callsByName.get(rawNameA).requestBuilder.path).toBe('/echo');
      expect(callsByName.get(rawNameB).requestBuilder.path).toBe('/items');
    });
  });
});
