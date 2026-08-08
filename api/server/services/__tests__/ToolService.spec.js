const { Constants: AgentConstants } = require('@librechat/agents');
const {
  Tools,
  Constants,
  ResourceType,
  ErrorTypes,
  EModelEndpoint,
  isActionTool,
  actionDelimiter,
  AgentCapabilities,
  defaultAgentCapabilities,
} = require('librechat-data-provider');

const mockGetEndpointsConfig = jest.fn();
const mockGetMCPServerTools = jest.fn();
const mockGetMCPServerCatalog = jest.fn();
const mockGetCachedTools = jest.fn();
const mockSendEvent = jest.fn();
const mockEmitChunk = jest.fn();
jest.mock('~/server/services/Config', () => ({
  getEndpointsConfig: (...args) => mockGetEndpointsConfig(...args),
  getMCPServerTools: (...args) => mockGetMCPServerTools(...args),
  getScopedCachedMCPServerTools: (...args) => mockGetMCPServerTools(...args),
  getMCPServerCatalog: (...args) => mockGetMCPServerCatalog(...args),
  getCachedTools: (...args) => mockGetCachedTools(...args),
}));

const mockLoadToolDefinitions = jest.fn();
const mockGetUserMCPAuthMap = jest.fn();
const mockGetMCPAuthorizationIdentity = jest.fn();
const mockShouldDetectRuntimeOAuth = jest.fn();
jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
  isFatalAgentInitializationError: (error) =>
    ['AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE', 'resource_recovery_required'].includes(error?.code),
  loadToolDefinitions: (...args) => mockLoadToolDefinitions(...args),
  getUserMCPAuthMap: (...args) => mockGetUserMCPAuthMap(...args),
  getMCPAuthorizationIdentity: (...args) => mockGetMCPAuthorizationIdentity(...args),
  shouldDetectRuntimeOAuth: (...args) => mockShouldDetectRuntimeOAuth(...args),
  sendEvent: (...args) => mockSendEvent(...args),
  GenerationJobManager: {
    emitChunk: (...args) => mockEmitChunk(...args),
  },
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
const mockGetServerConfig = jest.fn();
const mockEnsureConfigServers = jest.fn();
const mockFlowManager = { getFlowState: jest.fn() };
const mockResolveConfigServers = jest.fn();
const mockResolveMcpServerNames = jest.fn();
const mockUserCanUseMCPServers = jest.fn().mockResolvedValue(true);
const mockUserCanUseMCPServersFresh = jest.fn().mockResolvedValue(true);
const mockResolveCurrentMCPAuthoritySnapshot = jest.fn();
const mockResolveCurrentMCPToolAuthority = jest.fn();
const mockMCPAuthorityResolver = {
  useIssuedResolution: jest.fn(async (resolution, action) => await action(resolution)),
  useIssuedResolutions: jest.fn(async (resolutions, action) => await action(resolutions)),
  bindWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
  executeWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
  publishManyWithCurrentAuthority: jest.fn(
    async (resolutions, action) => await action(resolutions),
  ),
  publishWithCurrentAuthority: jest.fn(async (resolution, action) => await action(resolution)),
};
const mockAsMCPAuthorityResolution = (authority, schemas = null) => {
  if (authority == null || authority.parsedConfig) {
    return authority;
  }
  const sourceConfig = authority.provenanceServerConfig ?? authority.serverConfig;
  const user = authority.user ?? { id: 'user_123' };
  const authorizationKind = authority.authorizationKind ?? 'none';
  const authorizationIdentity = authority.authorizationIdentity ?? 'none';
  return {
    parsedConfig: {
      actor: {
        userId: user.id,
        tenantId: authority.tenantId ?? user.tenantId ?? null,
        user,
      },
      serverName: authority.serverName,
      sourceConfig,
      effectiveConfig: authority.effectiveServerConfig ?? sourceConfig,
      securityPolicy: {
        ...(authority.securityPolicy ?? {}),
        useSSRFProtection: authority.securityPolicy?.useSSRFProtection ?? false,
      },
      securityPolicyIdentity: authority.securityPolicyIdentity ?? 'current-policy-identity',
      customUserVars: authority.customUserVars,
      authorization: {
        kind: authorizationKind,
        identity: authorizationIdentity,
        credentialSetId: authorizationIdentity === 'none' ? null : authorizationIdentity,
        generation: null,
      },
      catalogScope: authority.catalogScope,
      discoveryProvenance: authority.discoveryProvenance ?? null,
    },
    schemas,
    authorityProof: { revision: 'test-proof' },
  };
};
const mockAvailableToolsAuthorityScopes = new WeakMap();
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
  findToken: jest.fn().mockResolvedValue(null),
  findPluginAuthsByKeys: jest.fn(),
}));
jest.mock('~/config', () => ({
  getFlowStateManager: jest.fn(() => mockFlowManager),
  getMCPServersRegistry: jest.fn(() => ({
    ensureConfigServers: (...args) => mockEnsureConfigServers(...args),
    activateIssuedConfigServer: (serverName, serverConfig, securityPolicy) =>
      mockEnsureConfigServers(
        { [serverName]: serverConfig },
        { failClosed: true, allowlists: securityPolicy },
      ),
    getServerConfig: (...args) => mockGetServerConfig(...args),
  })),
}));
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: (...args) => mockResolveConfigServers(...args),
  resolveMcpServerNames: (...args) => mockResolveMcpServerNames(...args),
  resolveMcpServerContext: async (...args) => {
    const configServers = (await mockResolveConfigServers(...args)) ?? {};
    const serverNames = Object.keys(configServers);
    return { configServers, serverNames, rawServerNames: serverNames };
  },
  /** Mirrors the real resolver's shape; these fixtures use safe names, so the
   *  raw set is always the complete audit. */
  resolveCollisionAuditNames: jest.fn(async ({ rawServerNames, accessibleServerNames }) => ({
    names: accessibleServerNames?.length ? accessibleServerNames : rawServerNames,
    complete: true,
  })),
  createMCPPermissionContext: jest.fn((req) => ({
    canUseServers: (user) => mockUserCanUseMCPServers(user, req),
  })),
  userCanUseMCPServers: mockUserCanUseMCPServers,
  userCanUseMCPServersFresh: mockUserCanUseMCPServersFresh,
  stampMCPAvailableToolsAuthority: (availableTools, scope) => {
    if (availableTools && scope) {
      mockAvailableToolsAuthorityScopes.set(availableTools, scope);
    }
    return availableTools;
  },
  matchesMCPAvailableToolsAuthority: (availableTools, scope) =>
    scope == null ||
    JSON.stringify(mockAvailableToolsAuthorityScopes.get(availableTools)) === JSON.stringify(scope),
}));
jest.mock('~/server/services/MCPDiscoveryScope', () => ({
  matchesMCPToolAuthorityScope: (left, right) =>
    left != null && right != null && JSON.stringify(left) === JSON.stringify(right),
  resolveCurrentMCPAuthoritySnapshot: (...args) => mockResolveCurrentMCPAuthoritySnapshot(...args),
  resolveCurrentMCPToolAuthority: async (...args) => {
    const authority = await mockResolveCurrentMCPToolAuthority(...args);
    return mockAsMCPAuthorityResolution(authority, args[0]?.schemas ?? null);
  },
}));
jest.mock('~/server/services/MCPAuthority', () => ({
  getMCPAuthorityResolver: () => mockMCPAuthorityResolver,
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
const { createOnSearchResults } = require('~/server/services/Tools/search');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { PENDING_STALE_MS } = require('@librechat/api');

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
    mockGetMCPServerCatalog.mockReset();
    mockLoadToolDefinitions.mockReset();
    mockResolveCurrentMCPToolAuthority.mockReset();
    mockLoadToolDefinitions.mockResolvedValue({
      toolDefinitions: [],
      toolRegistry: new Map(),
      hasDeferredTools: false,
    });
    mockLoadToolsUtil.mockResolvedValue({ loadedTools: [], toolContextMap: {} });
    mockLoadActionSets.mockResolvedValue([]);
    mockGetMCPServerTools.mockResolvedValue(null);
    mockGetMCPServerCatalog.mockImplementation(async (params) => {
      const tools = await mockGetMCPServerTools(params);
      return tools
        ? {
            status: 'ready',
            tools,
            metadata: {
              authorizationKind:
                params.authorizationKind ??
                (params.authorizationIdentity === 'none' ? 'none' : 'oauth'),
            },
          }
        : { status: 'pending_activation', reason: 'cold' };
    });
    mockGetCachedTools.mockResolvedValue(null);
    mockGetUserMCPAuthMap.mockResolvedValue({});
    mockGetMCPAuthorizationIdentity.mockResolvedValue('none');
    mockShouldDetectRuntimeOAuth.mockReset();
    mockShouldDetectRuntimeOAuth.mockReturnValue(false);
    mockGetServerConfig.mockResolvedValue(undefined);
    mockEnsureConfigServers.mockResolvedValue({});
    mockFlowManager.getFlowState.mockResolvedValue(undefined);
    mockResolveConfigServers.mockResolvedValue({});
    mockResolveMcpServerNames.mockResolvedValue([]);
    mockUserCanUseMCPServersFresh.mockResolvedValue(true);
    mockResolveCurrentMCPAuthoritySnapshot.mockImplementation(
      async (user, _label, { serverNames = [] } = {}) => {
        const configs = { ...((await mockResolveConfigServers()) ?? {}) };
        for (const serverName of serverNames) {
          if (configs[serverName]) {
            continue;
          }
          let serverConfig;
          try {
            serverConfig = await mockGetServerConfig(serverName, user?.id, configs);
          } catch {
            return null;
          }
          if (serverConfig) {
            configs[serverName] = serverConfig;
          }
        }
        return {
          configs,
          securityPolicy: { allowedDomains: null, allowedAddresses: null },
          securityPolicyIdentity: 'current-policy-identity',
          tenantId: user?.tenantId ?? null,
          user,
        };
      },
    );
    mockResolveCurrentMCPToolAuthority.mockImplementation(
      async ({ user, serverName, snapshot }) => {
        const currentSnapshot =
          snapshot ??
          (await mockResolveCurrentMCPAuthoritySnapshot(user, serverName, {
            serverNames: [serverName],
          }));
        const serverConfig = currentSnapshot?.configs?.[serverName];
        if (!serverConfig) {
          return null;
        }
        const customUserVars =
          Object.keys(serverConfig.customUserVars ?? {}).length > 0
            ? (await mockGetUserMCPAuthMap({ userId: user.id, servers: [serverName] }))[
                `${Constants.mcp_prefix}${serverName}`
              ]
            : undefined;
        const configuredOAuth = jest.requireActual('@librechat/api').isOAuthServer(serverConfig);
        const authorizationIdentity = configuredOAuth
          ? await mockGetMCPAuthorizationIdentity({ userId: user.id, serverName })
          : 'none';
        if (authorizationIdentity == null) {
          return null;
        }
        return {
          ...currentSnapshot,
          serverName,
          serverConfig,
          provenanceServerConfig: serverConfig,
          customUserVars,
          authorizationIdentity,
          authorizationKind: configuredOAuth || authorizationIdentity !== 'none' ? 'oauth' : 'none',
          catalogScope: { serverName, authorizationIdentity },
        };
      },
    );
  });

  it('does not query OAuth grant identity for a non-OAuth MCP server', async () => {
    const serverName = 'public-server';
    const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
    const req = createMockReq([AgentCapabilities.tools]);
    mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
    mockResolveConfigServers.mockResolvedValue({
      [serverName]: { type: 'streamable-http', url: 'https://mcp.example.com' },
    });
    mockGetMCPServerTools.mockResolvedValue({
      [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
    });
    mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
      const tools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
      return {
        toolDefinitions: tools ? Object.keys(tools) : [],
        toolRegistry: new Map(),
        hasDeferredTools: false,
      };
    });

    const result = await loadAgentTools({
      req,
      res: {},
      agent: { id: 'agent_123', tools: [mcpTool] },
      definitionsOnly: true,
    });

    expect(result.toolDefinitions).toEqual([mcpTool]);
    expect(mockGetMCPAuthorizationIdentity).not.toHaveBeenCalled();
    expect(mockGetMCPServerTools).toHaveBeenCalledWith({
      userId: req.user.id,
      serverName,
      serverConfig: expect.any(Object),
      customUserVars: undefined,
      tenantId: null,
      role: undefined,
      authorizationIdentity: 'none',
      authorizationKind: 'none',
      securityPolicyIdentity: 'current-policy-identity',
    });
  });

  it('does not bind or refresh a warm MCP catalog after current Config access is revoked', async () => {
    const serverName = 'revoked-server';
    const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
    const req = createMockReq([AgentCapabilities.tools]);
    mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
    mockResolveConfigServers.mockResolvedValue({
      [serverName]: { type: 'streamable-http', url: 'https://stale.example.com/mcp' },
    });
    mockResolveCurrentMCPAuthoritySnapshot.mockResolvedValue({
      configs: {},
      securityPolicy: { allowedDomains: null, allowedAddresses: null },
      securityPolicyIdentity: 'current-policy-identity',
      tenantId: null,
      user: req.user,
    });
    mockGetMCPServerTools.mockResolvedValue({
      [mcpTool]: { function: { name: mcpTool, description: 'Stale', parameters: {} } },
    });
    mockFlowManager.getFlowState.mockResolvedValue({
      status: 'PENDING',
      createdAt: Date.now(),
      metadata: { authorizationUrl: 'https://auth.example.com/revoked' },
    });
    mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
      const first = await deps.getOrFetchMCPServerTools(params.userId, serverName);
      const second = await deps.getOrFetchMCPServerTools(params.userId, serverName);
      const refreshed = await deps.refreshMCPServerTools(params.userId, serverName);
      return {
        toolDefinitions: [...Object.keys(first ?? {}), ...Object.keys(second ?? {})],
        toolRegistry: new Map(),
        hasDeferredTools: false,
        mcpResolution: { resolvedToolCount: refreshed ? Object.keys(refreshed).length : 0 },
      };
    });

    await expect(
      loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', name: 'Revoked Agent', tools: [mcpTool] },
        definitionsOnly: true,
      }),
    ).rejects.toThrow('Revoked Agent');

    expect(mockGetMCPServerTools).not.toHaveBeenCalled();
    expect(reinitMCPServer).not.toHaveBeenCalled();
    expect(mockSendEvent).not.toHaveBeenCalled();
  });

  it('does not bind a warm catalog after current MCP USE permission is revoked', async () => {
    const serverName = 'permission-revoked-server';
    const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
    const req = createMockReq([AgentCapabilities.tools]);
    mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
    mockResolveConfigServers.mockResolvedValue({
      [serverName]: { type: 'streamable-http', url: 'https://mcp.example.com' },
    });
    mockUserCanUseMCPServers.mockResolvedValue(true);
    mockUserCanUseMCPServersFresh.mockResolvedValue(false);
    mockGetMCPServerTools.mockResolvedValue({
      [mcpTool]: { function: { name: mcpTool, description: 'Stale', parameters: {} } },
    });

    await expect(
      loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', name: 'Revoked Agent', tools: [mcpTool] },
        definitionsOnly: true,
      }),
    ).rejects.toThrow('Revoked Agent');

    expect(mockGetMCPServerTools).not.toHaveBeenCalled();
    expect(reinitMCPServer).not.toHaveBeenCalled();
  });

  it('rejects a warm definition when authority is revoked before the final bind', async () => {
    const serverName = 'warm-bind-revoked';
    const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
    const req = createMockReq([AgentCapabilities.tools]);
    const serverConfig = { type: 'streamable-http', url: 'https://warm.example.com/mcp' };
    const catalogScope = { config: 'stable' };
    mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
    mockResolveConfigServers.mockResolvedValue({ [serverName]: serverConfig });
    mockResolveCurrentMCPToolAuthority
      .mockResolvedValueOnce({
        configs: { [serverName]: serverConfig },
        securityPolicyIdentity: 'current-policy-identity',
        tenantId: null,
        user: req.user,
        serverName,
        serverConfig,
        authorizationIdentity: 'none',
        authorizationKind: 'none',
        catalogScope,
      })
      .mockResolvedValueOnce(null);
    mockGetMCPServerTools.mockResolvedValue({
      [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
    });
    mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
      const tools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
      return {
        toolDefinitions: tools ? Object.keys(tools) : [],
        toolRegistry: new Map(),
        hasDeferredTools: false,
        mcpResolution: {
          expectedToolCount: 1,
          resolvedToolCount: tools ? 1 : 0,
        },
      };
    });

    await expect(
      loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE' });
    expect(reinitMCPServer).not.toHaveBeenCalled();
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

    it('should preserve the remote-agent permission boundary while priming files', async () => {
      const capabilities = [
        AgentCapabilities.tools,
        AgentCapabilities.file_search,
        AgentCapabilities.execute_code,
      ];
      const req = createMockReq(capabilities);
      const tool_resources = {
        file_search: { file_ids: ['search-file'] },
        execute_code: { file_ids: ['code-file'] },
      };
      const { primeFiles: primeSearchFiles } = require('~/app/clients/tools/util/fileSearch');
      const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [Tools.file_search, Tools.execute_code] },
        tool_resources,
        agentResourceType: ResourceType.REMOTE_AGENT,
        definitionsOnly: true,
      });

      const expectedParams = {
        req,
        tool_resources,
        agentId: 'agent_123',
        agentResourceType: ResourceType.REMOTE_AGENT,
      };
      expect(primeSearchFiles).toHaveBeenCalledWith(expectedParams);
      expect(primeCodeFiles).toHaveBeenCalledWith(expectedParams);
    });

    it('propagates a typed CodeAPI resource recovery failure before model invocation', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.execute_code];
      const req = createMockReq(capabilities);
      const resourceRecoveryError = Object.assign(new Error('resource recovery required'), {
        code: ErrorTypes.RESOURCE_RECOVERY_REQUIRED,
      });
      const { primeFiles: primeCodeFiles } = require('~/server/services/Files/Code/process');
      primeCodeFiles.mockRejectedValueOnce(resourceRecoveryError);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: {
            id: 'agent_123',
            tools: [Tools.execute_code, 'run_query_mcp_warehouse'],
          },
          tool_resources: { execute_code: { file_ids: ['stale-file'] } },
          definitionsOnly: true,
        }),
      ).rejects.toBe(resourceRecoveryError);
    });

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

    it('should exclude ask_user_question when its capability is disabled (even if tools is enabled)', async () => {
      // ask_user_question is gated by its OWN capability, like execute_code —
      // NOT the generic `tools` capability. Here `tools` is on but the ask
      // capability is not, so the tool must be filtered out.
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, 'ask_user_question'] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain(regularTool);
      expect(callArgs.tools).not.toContain('ask_user_question');
    });

    it('should include ask_user_question when its capability is enabled', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.ask_user_question];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, 'ask_user_question'] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain('ask_user_question');
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

    it('fails initialization when an explicitly selected MCP tool cannot be resolved', async () => {
      const mcpTool = `search${Constants.mcp_delimiter}warehouse`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveConfigServers.mockResolvedValue({
        warehouse: {
          type: 'streamable-http',
          url: 'https://mcp.example.com/warehouse',
        },
      });
      mockLoadToolDefinitions.mockResolvedValueOnce({
        toolDefinitions: [],
        toolRegistry: new Map(),
        hasDeferredTools: false,
        mcpResolution: { expectedToolCount: 1, resolvedToolCount: 0 },
      });

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: { id: 'agent_123', name: 'Target Agent', tools: [mcpTool] },
          definitionsOnly: true,
        }),
      ).rejects.toMatchObject({
        code: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
        statusCode: 503,
        message: expect.stringContaining('can access its selected tools'),
      });
    });

    it('fails closed when MCP definition loading throws before resolution completes', async () => {
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockLoadToolDefinitions.mockRejectedValueOnce(new Error('MCP registry unavailable'));

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: {
            id: 'agent_123',
            name: 'Target Agent',
            tools: [`run_query${Constants.mcp_delimiter}warehouse`],
          },
          definitionsOnly: true,
        }),
      ).rejects.toMatchObject({
        code: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
        statusCode: 503,
        cause: expect.objectContaining({ message: 'MCP registry unavailable' }),
      });
    });

    it('allows a server pin with no explicitly selected MCP tools', async () => {
      const serverPin = `${Constants.mcp_server}${Constants.mcp_delimiter}warehouse`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockLoadToolDefinitions.mockResolvedValueOnce({
        toolDefinitions: [],
        toolRegistry: new Map(),
        hasDeferredTools: false,
        mcpResolution: { expectedToolCount: 0, resolvedToolCount: 0 },
      });

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: { id: 'agent_123', tools: [serverPin] },
          definitionsOnly: true,
        }),
      ).resolves.toMatchObject({ toolDefinitions: [] });
    });

    it('allows partial MCP resolution when at least one expected tool is available', async () => {
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockLoadToolDefinitions.mockResolvedValueOnce({
        toolDefinitions: [{ name: 'list_sources_mcp_warehouse', toolType: 'mcp' }],
        toolRegistry: new Map(),
        hasDeferredTools: false,
        mcpResolution: { expectedToolCount: 2, resolvedToolCount: 1 },
      });

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: {
            id: 'agent_123',
            tools: [
              `list_sources${Constants.mcp_delimiter}warehouse`,
              `run_query${Constants.mcp_delimiter}warehouse`,
            ],
          },
          definitionsOnly: true,
        }),
      ).resolves.toMatchObject({
        toolDefinitions: [expect.objectContaining({ name: 'list_sources_mcp_warehouse' })],
      });
    });

    it('should filter MCP tool definitions when user lacks MCP server use permission', async () => {
      const { userCanUseMCPServers } = require('~/server/services/MCP');
      userCanUseMCPServers.mockResolvedValueOnce(false);

      const mcpTool = `search${Constants.mcp_delimiter}myserver`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [regularTool, mcpTool] },
        definitionsOnly: true,
      });

      expect(mockLoadToolDefinitions).toHaveBeenCalledTimes(1);
      const [callArgs] = mockLoadToolDefinitions.mock.calls[0];
      expect(callArgs.tools).toContain(regularTool);
      expect(callArgs.tools).not.toContain(mcpTool);
    });

    it('fails explicitly when MCP permission filtering removes every expected tool', async () => {
      const { userCanUseMCPServers } = require('~/server/services/MCP');
      userCanUseMCPServers.mockResolvedValueOnce(false);

      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: {
            id: 'agent_123',
            tools: [`run_query${Constants.mcp_delimiter}warehouse`],
          },
          definitionsOnly: true,
        }),
      ).rejects.toMatchObject({
        code: 'AGENT_EXPECTED_MCP_TOOLS_UNAVAILABLE',
        statusCode: 503,
      });
      expect(mockLoadToolDefinitions).not.toHaveBeenCalled();
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

    it('emits separate MCP OAuth login steps and completion events for multiple pending servers', async () => {
      const req = createMockReq([AgentCapabilities.tools]);
      const res = { writableEnded: false };
      const servers = ['ELI', 'Vespa'];
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
      mockResolveConfigServers.mockResolvedValue(
        Object.fromEntries(
          servers.map((serverName) => [
            serverName,
            {
              type: 'streamable-http',
              url: `https://mcp.example.com/${serverName}`,
              requiresOAuth: true,
            },
          ]),
        ),
      );

      mockLoadToolDefinitions
        .mockImplementationOnce(async (_args, deps) => {
          await deps.getOrFetchMCPServerTools(req.user.id, servers[0]);
          await deps.getOrFetchMCPServerTools(req.user.id, servers[1]);
          return {
            toolDefinitions: [],
            toolRegistry: new Map(),
            hasDeferredTools: false,
          };
        })
        .mockResolvedValue({
          toolDefinitions: [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        });

      reinitMCPServer.mockImplementation(
        async ({ serverName, returnOnOAuth, oauthStart, oauthEnd }) => {
          if (returnOnOAuth === false) {
            await oauthStart(`https://auth.example.com/${serverName}`);
            await oauthEnd();
            return { availableTools: { [`tool_${serverName}`]: {} } };
          }

          await oauthStart(`https://auth.example.com/${serverName}`);
          return { availableTools: null };
        },
      );

      await loadAgentTools({
        req,
        res,
        agent: {
          id: 'agent_123',
          tools: servers.map((server) => `search${Constants.mcp_delimiter}${server}`),
        },
        definitionsOnly: true,
      });

      const runStepEvents = mockSendEvent.mock.calls
        .map(([, event]) => event)
        .filter((event) => event.data?.stepDetails?.type === 'tool_calls');
      const deltaEvents = mockSendEvent.mock.calls
        .map(([, event]) => event)
        .filter((event) => event.data?.delta?.type === 'tool_calls');
      const authDeltaEvents = deltaEvents.filter((event) => event.data.delta.auth);
      const completionEvents = mockSendEvent.mock.calls
        .map(([, event]) => event)
        .filter((event) => event.data?.result?.tool_call?.name?.startsWith('oauth'));

      expect(runStepEvents.map((event) => event.data.index)).toEqual([0, 1]);
      expect(authDeltaEvents.map((event) => event.data.id)).toEqual([
        'step_oauth_login_ELI',
        'step_oauth_login_Vespa',
      ]);
      expect(completionEvents.map((event) => event.data.result.id)).toEqual([
        'step_oauth_login_ELI',
        'step_oauth_login_Vespa',
      ]);
    });

    it('fences resumable MCP OAuth definition events to the owning job epoch', async () => {
      const req = createMockReq([AgentCapabilities.tools]);
      const res = { writableEnded: false };
      const serverName = 'Epoch-Server';
      const streamId = 'stream-epoch';
      const jobCreatedAt = 1234;
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig([AgentCapabilities.tools]));
      mockResolveConfigServers.mockResolvedValue({
        [serverName]: {
          type: 'streamable-http',
          url: `https://mcp.example.com/${serverName}`,
          requiresOAuth: true,
        },
      });
      mockLoadToolDefinitions
        .mockImplementationOnce(async (_args, deps) => {
          await deps.getOrFetchMCPServerTools(req.user.id, serverName);
          return {
            toolDefinitions: [],
            toolRegistry: new Map(),
            hasDeferredTools: false,
          };
        })
        .mockResolvedValue({
          toolDefinitions: [mcpTool],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        });
      reinitMCPServer.mockImplementation(async ({ returnOnOAuth, oauthStart, oauthEnd }) => {
        await oauthStart(`https://auth.example.com/${serverName}`);
        if (returnOnOAuth === false) {
          await oauthEnd();
          return { availableTools: { [mcpTool]: {} } };
        }
        return { availableTools: null };
      });

      await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
        streamId,
        jobCreatedAt,
      });

      expect(mockSendEvent).not.toHaveBeenCalled();
      expect(mockEmitChunk).toHaveBeenCalledTimes(3);
      expect(mockEmitChunk.mock.calls.map(([, event]) => event.event)).toEqual([
        'on_run_step',
        'on_run_step_delta',
        'on_run_step_completed',
      ]);
      for (const [emittedStreamId, , options] of mockEmitChunk.mock.calls) {
        expect(emittedStreamId).toBe(streamId);
        expect(options).toEqual({ expectedCreatedAt: jobCreatedAt });
      }
    });

    it('should not expose cached MCP tool definitions when the registry lookup fails', async () => {
      const serverName = 'private-server';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });
      mockGetMCPServerTools.mockResolvedValue({
        [mcpTool]: {
          function: {
            name: mcpTool,
            description: 'Cached private search',
            parameters: {},
          },
        },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const serverTools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: serverTools ? Object.keys(serverTools) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: { id: 'agent_123', tools: [mcpTool] },
          definitionsOnly: true,
        }),
      ).rejects.toThrow('none are available');
      expect(mockGetMCPServerTools).not.toHaveBeenCalled();
    });

    it('activates a selected cold Config server only after the cache-only authority miss', async () => {
      const serverName = 'Connector: Company_mcp_Gateway';
      const normalizedServerName = 'Connector__Company_mcp_Gateway';
      const mcpTool = `search${Constants.mcp_delimiter}${normalizedServerName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const serverConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com',
        source: 'config',
      };
      const activationSecurityPolicy = {
        allowedDomains: ['mcp.example.com'],
        allowedAddresses: null,
      };
      let activated = false;
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveCurrentMCPAuthoritySnapshot.mockImplementation(async (user) => ({
        configs: {},
        pendingConfigs: { [serverName]: serverConfig },
        collisionServerNames: [serverName],
        securityPolicy: { allowedDomains: null, allowedAddresses: null },
        securityPolicyIdentity: 'current-policy-identity',
        tenantId: null,
        user,
      }));
      mockEnsureConfigServers.mockImplementation(async () => {
        activated = true;
        return { [serverName]: serverConfig };
      });
      mockResolveCurrentMCPToolAuthority.mockImplementation(
        async ({ user, expectedServerConfig, serverName: requestedServerName }) =>
          requestedServerName !== serverName || (!activated && !expectedServerConfig)
            ? null
            : {
                configs: { [serverName]: serverConfig },
                securityPolicy: activationSecurityPolicy,
                securityPolicyIdentity: 'current-policy-identity',
                tenantId: null,
                user,
                serverName,
                serverConfig,
                authorizationIdentity: 'none',
                authorizationKind: 'none',
                catalogScope: { config: 'stable' },
              },
      );
      mockLoadToolDefinitions.mockImplementation(
        jest.requireActual('@librechat/api').loadToolDefinitions,
      );
      reinitMCPServer.mockResolvedValue({
        availableTools: {
          [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
        },
        authorityScope: { config: 'stable' },
      });

      const result = await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
        accessibleMcpServerNames: [serverName],
      });

      expect(result.toolDefinitions).toEqual([
        expect.objectContaining({ name: mcpTool, serverName }),
      ]);
      expect(mockEnsureConfigServers).toHaveBeenCalledWith(
        { [serverName]: serverConfig },
        {
          failClosed: true,
          allowlists: { ...activationSecurityPolicy, useSSRFProtection: false },
        },
      );
      expect(mockMCPAuthorityResolver.useIssuedResolution).toHaveBeenCalled();
      expect(reinitMCPServer.mock.calls.map(([params]) => params.serverName)).toEqual([serverName]);
    });

    it('does not inspect a selected cold Config server when its bind fence rejects', async () => {
      const serverName = 'cold-revoked';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const serverConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com',
        source: 'config',
      };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveCurrentMCPAuthoritySnapshot.mockImplementation(async (user) => ({
        configs: {},
        pendingConfigs: { [serverName]: serverConfig },
        collisionServerNames: [serverName],
        securityPolicy: { allowedDomains: null, allowedAddresses: null },
        securityPolicyIdentity: 'current-policy-identity',
        tenantId: null,
        user,
      }));
      mockResolveCurrentMCPToolAuthority.mockImplementation(
        async ({ user, expectedServerConfig }) =>
          expectedServerConfig
            ? {
                user,
                serverName,
                serverConfig,
                authorizationIdentity: 'none',
                authorizationKind: 'none',
                catalogScope: { config: 'stable' },
              }
            : null,
      );
      mockLoadToolDefinitions.mockImplementation(
        jest.requireActual('@librechat/api').loadToolDefinitions,
      );
      mockMCPAuthorityResolver.useIssuedResolution.mockRejectedValueOnce(
        new Error('authority revoked before cold inspection'),
      );

      await expect(
        loadAgentTools({
          req,
          res: {},
          agent: { id: 'agent_123', tools: [mcpTool] },
          definitionsOnly: true,
          accessibleMcpServerNames: [serverName],
        }),
      ).rejects.toThrow('none are available');
      expect(mockEnsureConfigServers).not.toHaveBeenCalled();
      expect(reinitMCPServer).not.toHaveBeenCalled();
    });

    it.each([
      ['named selection', `search${Constants.mcp_delimiter}foo_mcp_bar`],
      ['mcp_all selection', `${Constants.mcp_all}${Constants.mcp_delimiter}foo_mcp_bar`],
    ])('resolves a DB-only delimiter-bearing server for a %s', async (_label, selection) => {
      const serverName = 'foo_mcp_bar';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const serverConfig = {
        type: 'streamable-http',
        url: 'https://db-only.example.com/mcp',
        source: 'user',
      };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveConfigServers.mockResolvedValue({});
      mockGetServerConfig.mockImplementation(async (name) =>
        name === serverName ? serverConfig : undefined,
      );
      mockResolveCurrentMCPToolAuthority.mockImplementation(async ({ user }) => ({
        configs: { [serverName]: serverConfig },
        securityPolicyIdentity: 'current-policy-identity',
        tenantId: null,
        user,
        serverName,
        serverConfig,
        authorizationIdentity: 'none',
        authorizationKind: 'none',
        catalogScope: { config: 'stable' },
      }));
      mockLoadToolDefinitions.mockImplementation(
        jest.requireActual('@librechat/api').loadToolDefinitions,
      );
      reinitMCPServer.mockResolvedValue({
        availableTools: {
          [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
        },
        authorityScope: { config: 'stable' },
      });

      const result = await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [selection] },
        definitionsOnly: true,
        accessibleMcpServerNames: [serverName],
      });

      expect(result.toolDefinitions).toEqual([
        expect.objectContaining({ name: mcpTool, serverName }),
      ]);
      expect(mockGetServerConfig).toHaveBeenCalledWith(
        serverName,
        req.user.id,
        expect.objectContaining({ [serverName]: serverConfig }),
      );
    });

    it('rechecks a runtime OAuth catalog with the current grant before binding it', async () => {
      const serverName = 'runtime-oauth';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      const serverConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/users/{{LIBRECHAT_USER_ID}}',
      };
      const tools = {
        [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
      };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveConfigServers.mockResolvedValue({ [serverName]: serverConfig });
      mockShouldDetectRuntimeOAuth.mockReturnValue(true);
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        createdAt: Date.now(),
        metadata: { authorizationUrl: 'https://auth.example.com/runtime' },
      });
      mockResolveCurrentMCPToolAuthority.mockImplementation(
        async ({ user, serverName: currentServerName, oauthRequiredHint }) => ({
          configs: { [serverName]: serverConfig },
          securityPolicy: { allowedDomains: null, allowedAddresses: null },
          securityPolicyIdentity: 'current-policy-identity',
          tenantId: null,
          user,
          serverName: currentServerName,
          serverConfig,
          provenanceServerConfig:
            oauthRequiredHint === true ? { ...serverConfig, requiresOAuth: true } : serverConfig,
          customUserVars: undefined,
          authorizationIdentity: oauthRequiredHint === true ? 'grant-current' : 'none',
          authorizationKind: oauthRequiredHint === true ? 'oauth' : 'none',
          catalogScope: { credentials: oauthRequiredHint === true ? 'grant' : 'none' },
        }),
      );
      mockGetMCPServerCatalog
        .mockResolvedValueOnce({ status: 'pending_activation', reason: 'credentials_changed' })
        .mockResolvedValueOnce({
          status: 'ready',
          tools,
          metadata: { authorizationKind: 'oauth' },
        });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const available = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: available ? Object.keys(available) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });

      const result = await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(mockGetMCPServerCatalog).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ authorizationIdentity: 'none', authorizationKind: 'none' }),
      );
      expect(mockGetMCPServerCatalog).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          authorizationIdentity: 'grant-current',
          authorizationKind: 'oauth',
        }),
      );
      expect(reinitMCPServer).not.toHaveBeenCalled();
      expect(mockSendEvent).not.toHaveBeenCalled();
    });

    it('does not replay a pending MCP OAuth prompt during a warm catalog hit', async () => {
      const serverName = 'Google-Workspace';
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/mcp',
        requiresOAuth: true,
      });
      mockGetMCPServerTools.mockResolvedValue({
        [mcpTool]: {
          function: {
            name: mcpTool,
            description: 'Cached search',
            parameters: {},
          },
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        createdAt: Date.now(),
        metadata: { authorizationUrl },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const serverTools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: serverTools ? Object.keys(serverTools) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer.mockImplementation(async ({ oauthStart }) => {
        await oauthStart(authorizationUrl);
        return { availableTools: { [mcpTool]: {} } };
      });

      const result = await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(mockGetMCPServerTools).toHaveBeenCalledWith({
        userId: req.user.id,
        serverName,
        serverConfig: expect.objectContaining({ requiresOAuth: true }),
        customUserVars: undefined,
        tenantId: null,
        role: undefined,
        authorizationIdentity: 'none',
        authorizationKind: 'oauth',
        securityPolicyIdentity: 'current-policy-identity',
      });
      expect(reinitMCPServer).not.toHaveBeenCalled();
      expect(mockSendEvent).not.toHaveBeenCalled();
    });

    it('should not join in-flight MCP initialization before replaying pending OAuth prompts', async () => {
      const serverName = 'Google-Workspace';
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `${Constants.mcp_all}${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/mcp',
        requiresOAuth: true,
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        createdAt: Date.now(),
        metadata: { authorizationUrl },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer.mockImplementation(async ({ oauthStart }) => {
        await oauthStart(authorizationUrl);
        return { availableTools: null };
      });

      await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(mockGetMCPServerTools).toHaveBeenCalledWith({
        userId: req.user.id,
        serverName,
        serverConfig: expect.objectContaining({ requiresOAuth: true }),
        customUserVars: undefined,
        tenantId: null,
        role: undefined,
        authorizationIdentity: 'none',
        authorizationKind: 'oauth',
        securityPolicyIdentity: 'current-policy-identity',
      });
      expect(reinitMCPServer).toHaveBeenCalledTimes(1);
      expect(reinitMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          returnOnOAuth: false,
          oauthStart: expect.any(Function),
        }),
      );
      expect(mockSendEvent).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          event: 'on_run_step_delta',
          data: expect.objectContaining({
            id: `step_oauth_login_${serverName}`,
            delta: expect.objectContaining({
              auth: authorizationUrl,
            }),
          }),
        }),
      );
    });

    it('should re-emit pending MCP OAuth prompts when selected MCP tools are already concrete', async () => {
      const serverName = `Google${Constants.mcp_delimiter}Workspace`;
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      /** A server whose own name contains the delimiter is only resolvable
       *  against the configured set, so the key boundary is unambiguous. */
      mockResolveConfigServers.mockResolvedValue({ [serverName]: {} });
      const res = { writableEnded: false };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        createdAt: Date.now(),
        metadata: { authorizationUrl },
      });
      mockLoadToolDefinitions.mockResolvedValue({
        toolDefinitions: [mcpTool],
        toolRegistry: new Map(),
        hasDeferredTools: false,
      });
      reinitMCPServer.mockImplementation(async ({ oauthStart }) => {
        await oauthStart(authorizationUrl);
        return { availableTools: { [mcpTool]: {} } };
      });

      const result = await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(mockGetMCPServerTools).not.toHaveBeenCalled();
      expect(reinitMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          returnOnOAuth: false,
          oauthStart: expect.any(Function),
        }),
      );
      expect(mockSendEvent).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          event: 'on_run_step_delta',
          data: expect.objectContaining({
            id: `step_oauth_login_${serverName}`,
            delta: expect.objectContaining({
              auth: authorizationUrl,
            }),
          }),
        }),
      );
    });

    it('does not replay a stored pending MCP OAuth prompt after a scoped catalog hit', async () => {
      const serverName = 'Google-Workspace';
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/mcp',
        requiresOAuth: true,
      });
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        createdAt: Date.now(),
        metadata: { authorizationUrl },
      });
      mockGetMCPServerTools.mockResolvedValue({
        [mcpTool]: { function: { name: mcpTool, description: 'Search', parameters: {} } },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const tools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: tools ? Object.keys(tools) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });

      const result = await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(mockGetMCPServerTools).toHaveBeenCalled();
      expect(reinitMCPServer).not.toHaveBeenCalled();
      expect(mockSendEvent).not.toHaveBeenCalled();
    });

    it('should preserve OAuth URLs emitted while discovering MCP tools before a silent wait join', async () => {
      const serverName = 'Google-Workspace';
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/mcp',
        requiresOAuth: true,
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer
        .mockImplementationOnce(async ({ oauthStart }) => {
          await oauthStart(authorizationUrl, { expiresAt: Date.now() + 60_000 });
          return { availableTools: null };
        })
        .mockResolvedValue({ availableTools: null });

      await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(reinitMCPServer).toHaveBeenCalledTimes(2);
      expect(mockSendEvent).toHaveBeenCalledWith(
        res,
        expect.objectContaining({
          event: 'on_run_step_delta',
          data: expect.objectContaining({
            id: `step_oauth_login_${serverName}`,
            delta: expect.objectContaining({
              auth: authorizationUrl,
            }),
          }),
        }),
      );
    });

    it('should pass request body context into MCP tool definition reinitialization', async () => {
      const serverName = 'Body-Scoped';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      req.body = { conversationId: 'conv-123', messageId: 'msg-123' };

      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer.mockResolvedValue({ availableTools: null });

      await loadAgentTools({
        req,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(reinitMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          requestBody: req.body,
        }),
      );
      expect(mockGetMCPServerTools).toHaveBeenCalledWith({
        userId: req.user.id,
        serverName,
        serverConfig: expect.objectContaining({
          url: expect.stringContaining('LIBRECHAT_BODY_MESSAGEID'),
        }),
        customUserVars: undefined,
        tenantId: null,
        role: undefined,
        authorizationIdentity: 'none',
        authorizationKind: 'none',
        securityPolicyIdentity: 'current-policy-identity',
      });
    });

    it('returns run-scoped MCP tool definitions for request-scoped servers', async () => {
      const serverName = 'ClickHouse';
      const mcpTool = `list_tables${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      req.body = { conversationId: 'conv-123', messageId: 'msg-123' };
      const availableTools = {
        [mcpTool]: {
          function: {
            name: mcpTool,
            description: 'List tables',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const serverTools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: serverTools ? Object.keys(serverTools) : [],
          toolRegistry: new Map([[mcpTool, { name: mcpTool }]]),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer.mockResolvedValue({
        availableTools,
        authorityScope: { serverName, authorizationIdentity: 'none' },
      });

      const result = await loadAgentTools({
        req,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(result.mcpAvailableTools).toEqual({ [serverName]: availableTools });
      expect(mockGetMCPServerTools).toHaveBeenCalledWith({
        userId: req.user.id,
        serverName,
        serverConfig: expect.objectContaining({
          url: expect.stringContaining('LIBRECHAT_BODY_MESSAGEID'),
        }),
        customUserVars: undefined,
        tenantId: null,
        role: undefined,
        authorizationIdentity: 'none',
        authorizationKind: 'none',
        securityPolicyIdentity: 'current-policy-identity',
      });
    });

    it('does not remember raw schemas rejected by reinitialization scope validation', async () => {
      const serverName = 'OAuth-Docs';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);

      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/docs',
        requiresOAuth: true,
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const serverTools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: serverTools ? Object.keys(serverTools) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer.mockResolvedValue({
        availableTools: null,
        tools: [{ name: 'search', inputSchema: { type: 'object' } }],
        success: false,
      });

      const result = await loadAgentTools({
        req,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([]);
      expect(result.mcpAvailableTools).toEqual({});
      expect(reinitMCPServer).toHaveBeenCalledTimes(1);
    });

    it('should preserve pending-flow expiry for OAuth URLs captured during discovery', async () => {
      const serverName = 'Google-Workspace';
      const authorizationUrl = 'https://auth.example.com/Google-Workspace';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      const res = { writableEnded: false };
      const createdAt = Date.now() - 45_000;
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockGetServerConfig.mockResolvedValue({
        type: 'streamable-http',
        url: 'https://demo.librechat.ai/mcp',
        requiresOAuth: true,
      });
      mockGetMCPServerTools.mockResolvedValue(null);
      mockFlowManager.getFlowState.mockResolvedValueOnce(null).mockResolvedValueOnce({
        status: 'PENDING',
        createdAt,
        metadata: { authorizationUrl },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });
      reinitMCPServer
        .mockImplementationOnce(async ({ oauthStart }) => {
          await oauthStart(authorizationUrl);
          return { availableTools: null };
        })
        .mockResolvedValue({ availableTools: null });

      await loadAgentTools({
        req,
        res,
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      const authDeltaEvent = mockSendEvent.mock.calls
        .map(([, event]) => event)
        .find((event) => event.data?.delta?.auth === authorizationUrl);
      expect(authDeltaEvent?.data.delta.expires_at).toBe(createdAt + PENDING_STALE_MS);
    });

    it('should use request-scoped MCP config before falling back to the registry', async () => {
      const serverName = 'config-server';
      const mcpTool = `search${Constants.mcp_delimiter}${serverName}`;
      const capabilities = [AgentCapabilities.tools];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));
      mockResolveConfigServers.mockResolvedValue({
        [serverName]: {
          type: 'streamable-http',
          url: 'https://config.example.com/mcp',
          customUserVars: {
            TOKEN: { title: 'Token', description: 'Token' },
          },
        },
      });
      mockGetUserMCPAuthMap.mockResolvedValue({
        [`${Constants.mcp_prefix}${serverName}`]: { TOKEN: 'secret' },
      });
      mockGetMCPServerTools.mockResolvedValue({
        [mcpTool]: {
          function: {
            name: mcpTool,
            description: 'Config search',
            parameters: {},
          },
        },
      });
      mockLoadToolDefinitions.mockImplementation(async (params, deps) => {
        const serverTools = await deps.getOrFetchMCPServerTools(params.userId, serverName);
        return {
          toolDefinitions: serverTools ? Object.keys(serverTools) : [],
          toolRegistry: new Map(),
          hasDeferredTools: false,
        };
      });

      const result = await loadAgentTools({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [mcpTool] },
        definitionsOnly: true,
      });

      expect(result.toolDefinitions).toEqual([mcpTool]);
      expect(mockGetServerConfig).not.toHaveBeenCalled();
      expect(mockGetMCPServerTools).toHaveBeenCalledWith({
        userId: req.user.id,
        serverName,
        serverConfig: expect.objectContaining({ url: 'https://config.example.com/mcp' }),
        customUserVars: { TOKEN: 'secret' },
        tenantId: null,
        role: undefined,
        authorizationIdentity: 'none',
        authorizationKind: 'none',
        securityPolicyIdentity: 'current-policy-identity',
      });
    });
  });

  describe('loadAgentTools (definitionsOnly=false) — action tool filtering', () => {
    const actionToolName = `get_weather${actionDelimiter}api_example_com`;
    const regularTool = 'calculator';

    it('threads the owning job epoch into web-search attachment callbacks', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.web_search];
      const req = createMockReq(capabilities);
      const res = {};
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadAgentTools({
        req,
        res,
        streamId: 'conversation-1',
        jobCreatedAt: 1234,
        agent: { id: 'agent_123', tools: [Tools.web_search] },
        definitionsOnly: false,
      });

      expect(createOnSearchResults).toHaveBeenCalledWith(res, 'conversation-1', 1234);
    });

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
    it('should preserve the remote-agent permission boundary for deferred tool loading', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.file_search];
      const req = createMockReq(capabilities);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_123', tools: [Tools.file_search] },
        toolNames: [Tools.file_search],
        agentResourceType: ResourceType.REMOTE_AGENT,
        actionsEnabled: false,
      });

      expect(mockLoadToolsUtil).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            agentResourceType: ResourceType.REMOTE_AGENT,
          }),
        }),
      );
    });

    const actionToolName = `get_weather${actionDelimiter}api_example_com`;
    const regularTool = Tools.web_search;

    it('threads the owning job epoch into web-search attachment callbacks', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.web_search];
      const req = createMockReq(capabilities);
      const res = {};
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadToolsForExecution({
        req,
        res,
        streamId: 'conversation-1',
        jobCreatedAt: 1234,
        agent: { id: 'agent_123', tools: [Tools.web_search] },
        toolNames: [Tools.web_search],
        actionsEnabled: false,
      });

      expect(createOnSearchResults).toHaveBeenCalledWith(res, 'conversation-1', 1234);
    });

    it('does not load code execution tools that were not registered for the agent', async () => {
      const capabilities = [
        AgentCapabilities.tools,
        AgentCapabilities.web_search,
        AgentCapabilities.execute_code,
      ];
      const req = createMockReq(capabilities);
      const toolRegistry = new Map([[Tools.web_search, { name: Tools.web_search }]]);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_without_code', tools: [Tools.web_search] },
        toolNames: [AgentConstants.BASH_TOOL, Tools.execute_code],
        toolRegistry,
        actionsEnabled: false,
      });

      expect(result.loadedTools.map((tool) => tool.name)).toEqual([]);
      expect(mockLoadToolsUtil).not.toHaveBeenCalled();
    });

    it('loads bash PTC under the legacy programmatic tool name when code capabilities are enabled', async () => {
      const capabilities = [
        AgentCapabilities.tools,
        AgentCapabilities.programmatic_tools,
        AgentCapabilities.execute_code,
      ];
      const req = createMockReq(capabilities);
      const toolRegistry = new Map([['custom_tool', { name: 'custom_tool' }]]);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_ptc', tools: [Tools.execute_code] },
        toolNames: [Constants.PROGRAMMATIC_TOOL_CALLING],
        toolRegistry,
        actionsEnabled: false,
      });

      expect(result.loadedTools.map((tool) => tool.name)).toEqual([
        Constants.PROGRAMMATIC_TOOL_CALLING,
      ]);
      expect(result.configurable.toolRegistry).toBe(toolRegistry);
      expect(result.configurable.ptcToolMap.size).toBe(0);
    });

    it('passes run-scoped MCP tool definitions into PTC execution loading', async () => {
      const capabilities = [
        AgentCapabilities.tools,
        AgentCapabilities.programmatic_tools,
        AgentCapabilities.execute_code,
      ];
      const req = createMockReq(capabilities);
      const serverName = 'ClickHouse';
      const mcpTool = `list_tables${Constants.mcp_delimiter}${serverName}`;
      const mcpAvailableTools = {
        [serverName]: {
          [mcpTool]: {
            function: {
              name: mcpTool,
              description: 'List tables',
              parameters: { type: 'object', properties: {} },
            },
          },
        },
      };
      const toolRegistry = new Map([[mcpTool, { name: mcpTool }]]);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_ptc', tools: [Tools.execute_code] },
        toolNames: [Constants.BASH_PROGRAMMATIC_TOOL_CALLING],
        toolRegistry,
        mcpAvailableTools,
        actionsEnabled: false,
      });

      expect(mockLoadToolsUtil).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [mcpTool],
          options: expect.objectContaining({
            mcpAvailableTools,
          }),
        }),
      );
    });

    it('does not load PTC when programmatic tools capability is disabled', async () => {
      const capabilities = [AgentCapabilities.tools, AgentCapabilities.execute_code];
      const req = createMockReq(capabilities);
      const toolRegistry = new Map([['custom_tool', { name: 'custom_tool' }]]);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_ptc', tools: [Tools.execute_code] },
        toolNames: [Constants.BASH_PROGRAMMATIC_TOOL_CALLING],
        toolRegistry,
        actionsEnabled: false,
      });

      expect(result.loadedTools.map((tool) => tool.name)).toEqual([]);
      expect(result.configurable.toolRegistry).toBeUndefined();
      expect(result.configurable.ptcToolMap).toBeUndefined();
    });

    it('does not load PTC when agent did not request execute_code', async () => {
      const capabilities = [
        AgentCapabilities.tools,
        AgentCapabilities.programmatic_tools,
        AgentCapabilities.execute_code,
      ];
      const req = createMockReq(capabilities);
      const toolRegistry = new Map([['custom_tool', { name: 'custom_tool' }]]);
      mockGetEndpointsConfig.mockResolvedValue(createEndpointsConfig(capabilities));

      const result = await loadToolsForExecution({
        req,
        res: {},
        agent: { id: 'agent_ptc', tools: [] },
        toolNames: [Constants.BASH_PROGRAMMATIC_TOOL_CALLING],
        toolRegistry,
        actionsEnabled: false,
      });

      expect(result.loadedTools.map((tool) => tool.name)).toEqual([]);
      expect(result.configurable.toolRegistry).toBeUndefined();
      expect(result.configurable.ptcToolMap).toBeUndefined();
    });

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
      expect(defaultAgentCapabilities).toContain(AgentCapabilities.ask_user_question);
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
