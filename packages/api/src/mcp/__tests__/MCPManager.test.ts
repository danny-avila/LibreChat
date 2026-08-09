import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { GraphTokenResolver } from '~/utils/graph';
import type * as t from '~/mcp/types';
import {
  MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
  createMCPConnectionProvenance,
  createMCPToolCatalogSecurityPolicyIdentity,
} from '~/mcp/catalog';
import { OboTokenResolutionError, detectOAuthRequirement, resolveOboToken } from '~/mcp/oauth';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { isMCPDomainAllowed } from '~/auth/domain';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';
import * as graphUtils from '~/utils/graph';
import { processMCPEnv } from '~/utils/env';

// Mock external dependencies
const mockGetTenantId = jest.fn();
jest.mock('@librechat/data-schemas', () => ({
  getTenantId: (...args: unknown[]) => mockGetTenantId(...args),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/utils/graph', () => ({
  ...jest.requireActual('~/utils/graph'),
  preProcessGraphTokens: jest.fn(),
}));

jest.mock('~/mcp/oauth', () => ({
  ...jest.requireActual('~/mcp/oauth'),
  detectOAuthRequirement: jest.fn(),
  resolveOboToken: jest.fn(),
}));

jest.mock('~/utils/env', () => ({
  processMCPEnv: jest.fn((params) => params.options),
  MCP_PLUGIN_SOURCE: 'plugin',
  isPluginSourced: jest.fn((config) => config?.source === 'plugin'),
}));

jest.mock('~/auth/domain', () => ({
  isMCPDomainAllowed: jest.fn().mockResolvedValue(true),
}));

const mockShouldEnableSSRFProtection = jest.fn().mockReturnValue(false);
const mockGetAllowedDomains = jest.fn().mockReturnValue(null);
const mockGetAllowedAddresses = jest.fn().mockReturnValue(null);
const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  isAppServerConfig: jest.fn(),
  getAllServerConfigs: jest.fn(),
  getOAuthServers: jest.fn(),
  shouldEnableSSRFProtection: mockShouldEnableSSRFProtection,
  getAllowedDomains: mockGetAllowedDomains,
  getAllowedAddresses: mockGetAllowedAddresses,
  // Mirrors the real per-request resolver by reading the base-allowlist mocks above, so
  // existing tests that override getAllowedDomains/shouldEnableSSRFProtection still apply.
  resolveAllowlists: jest.fn(async () => ({
    allowedDomains: mockGetAllowedDomains(),
    allowedAddresses: mockGetAllowedAddresses(),
    useSSRFProtection: mockShouldEnableSSRFProtection(),
  })),
};

jest.mock('~/mcp/registry/MCPServersRegistry', () => ({
  MCPServersRegistry: {
    getInstance: () => mockRegistryInstance,
  },
}));

jest.mock('~/mcp/registry/MCPServersInitializer', () => ({
  MCPServersInitializer: {
    initialize: jest.fn(),
  },
}));

jest.mock('~/mcp/registry/MCPServerInspector');
jest.mock('~/mcp/ConnectionsRepository');
jest.mock('~/mcp/MCPConnectionFactory');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockResolveOboToken = resolveOboToken as jest.MockedFunction<typeof resolveOboToken>;
const mockDetectOAuthRequirement = detectOAuthRequirement as jest.MockedFunction<
  typeof detectOAuthRequirement
>;
const mockProcessMCPEnv = processMCPEnv as jest.MockedFunction<typeof processMCPEnv>;
const mockIsMCPDomainAllowed = isMCPDomainAllowed as jest.MockedFunction<typeof isMCPDomainAllowed>;

describe('MCPManager', () => {
  const userId = 'test-user-123';
  const serverName = 'test_server';
  const securityPolicy = {
    allowedDomains: null,
    allowedAddresses: null,
    useSSRFProtection: false,
  };
  const authorityScope: t.MCPToolCatalogScope = {
    tenant: 'tenant-revision',
    principal: 'principal-revision',
    server: 'server-revision',
    policy: 'policy-revision',
    config: 'config-revision',
    credentials: 'credential-revision',
  };

  function issuedConnectionInput(
    sourceConfig: t.ParsedServerConfig,
    effectiveServerConfig: t.MCPOptions = sourceConfig,
    authorityAuthorizationKind: t.MCPConnectionProvenance['authorizationKind'] = 'none',
    oauthAuthorityScope: t.MCPToolCatalogScope = authorityScope,
  ) {
    return {
      serverConfig: sourceConfig,
      effectiveServerConfig,
      securityPolicy,
      oauthAuthorityScope,
      authorityAuthorizationKind,
    };
  }

  beforeEach(() => {
    // Reset MCPManager singleton state
    (MCPManager as unknown as { instance: null }).instance = null;
    jest.clearAllMocks();

    // Set up default mock implementations
    (MCPServersInitializer.initialize as jest.Mock).mockResolvedValue(undefined);
    (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({});
    (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
      type: 'stdio',
      command: 'test',
      args: [],
      source: 'yaml',
    });
    (mockRegistryInstance.isAppServerConfig as jest.Mock).mockResolvedValue(true);
    (mockRegistryInstance.shouldEnableSSRFProtection as jest.Mock).mockReturnValue(false);
    (mockRegistryInstance.getAllowedDomains as jest.Mock).mockReturnValue(null);
    (mockRegistryInstance.getAllowedAddresses as jest.Mock).mockReturnValue(null);
    (mockRegistryInstance.resolveAllowlists as jest.Mock).mockImplementation(async () => ({
      allowedDomains: mockGetAllowedDomains(),
      allowedAddresses: mockGetAllowedAddresses(),
      useSSRFProtection: mockShouldEnableSSRFProtection(),
    }));
    mockGetTenantId.mockReturnValue(undefined);
    mockProcessMCPEnv.mockImplementation((params) => params.options);
    mockIsMCPDomainAllowed.mockResolvedValue(true);
    mockDetectOAuthRequirement.mockResolvedValue({
      requiresOAuth: false,
      method: 'no-metadata-found',
    });
  });

  function mockAppConnections(
    appConnectionsConfig: Partial<ConnectionsRepository>,
  ): jest.MockedClass<typeof ConnectionsRepository> {
    const mock = {
      has: jest.fn().mockResolvedValue(false),
      get: jest.fn().mockResolvedValue({} as unknown as MCPConnection),
      getConnectionCount: jest.fn().mockReturnValue(0),
      ...appConnectionsConfig,
    };
    return (
      ConnectionsRepository as jest.MockedClass<typeof ConnectionsRepository>
    ).mockImplementation(() => mock as unknown as ConnectionsRepository);
  }

  function newMCPServersConfig(serverNameOverride?: string): t.MCPServers {
    return {
      [serverNameOverride ?? serverName]: {
        type: 'stdio',
        command: 'test',
        args: [],
      },
    };
  }

  describe('getAppToolFunctions', () => {
    it('should return empty object when no servers have tool functions', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        server1: { type: 'stdio', command: 'test', args: [] },
        server2: { type: 'stdio', command: 'test2', args: [] },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.getAppToolFunctions();

      expect(result).toEqual({});
    });

    it('does not open live connections while collecting the startup snapshot', async () => {
      const getAll = jest.fn().mockResolvedValue(new Map());
      mockAppConnections({ getAll });
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({});

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getAppToolFunctions();

      expect(getAll).not.toHaveBeenCalled();
    });

    it('should collect tool functions from multiple servers', async () => {
      const toolFunctions1 = {
        tool1_mcp_server1: {
          type: 'function' as const,
          function: {
            name: 'tool1_mcp_server1',
            description: 'Tool 1',
            parameters: { type: 'object' as const },
          },
        },
      };

      const toolFunctions2 = {
        tool2_mcp_server2: {
          type: 'function' as const,
          function: {
            name: 'tool2_mcp_server2',
            description: 'Tool 2',
            parameters: { type: 'object' as const },
          },
        },
      };

      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        server1: {
          type: 'stdio',
          command: 'test',
          args: [],
          toolFunctions: toolFunctions1,
        },
        server2: {
          type: 'stdio',
          command: 'test2',
          args: [],
          toolFunctions: toolFunctions2,
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.getAppToolFunctions();

      expect(result).toEqual({
        ...toolFunctions1,
        ...toolFunctions2,
      });
    });

    it('should handle servers with null or undefined toolFunctions', async () => {
      const toolFunctions1 = {
        tool1_mcp_server1: {
          type: 'function' as const,
          function: {
            name: 'tool1_mcp_server1',
            description: 'Tool 1',
            parameters: { type: 'object' as const },
          },
        },
      };

      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        server1: {
          type: 'stdio',
          command: 'test',
          args: [],
          toolFunctions: toolFunctions1,
        },
        server2: {
          type: 'stdio',
          command: 'test2',
          args: [],
          toolFunctions: null,
        },
        server3: {
          type: 'stdio',
          command: 'test3',
          args: [],
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.getAppToolFunctions();

      expect(result).toEqual(toolFunctions1);
    });

    it('excludes public user-managed servers from the app catalog', async () => {
      const operatorKey = 'operator_tool_mcp_operator';
      const publicKey = 'public_tool_mcp_public';
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        operator: {
          type: 'stdio',
          command: 'operator',
          source: 'yaml',
          toolFunctions: {
            [operatorKey]: { type: 'function', function: { name: operatorKey } },
          },
        },
        public: {
          type: 'streamable-http',
          url: 'https://public.example.com/mcp',
          source: 'user',
          toolFunctions: {
            [publicKey]: { type: 'function', function: { name: publicKey } },
          },
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await expect(manager.getAppToolFunctions()).resolves.toEqual({
        [operatorKey]: { type: 'function', function: { name: operatorKey } },
      });
    });
  });

  describe('connectAppServers', () => {
    it('opens only operator app connections and refreshes their current catalogs', async () => {
      const connection = new MCPConnection({
        serverName: 'dynamic',
        serverConfig: { type: 'streamable-http', url: 'http://localhost/mcp' },
        useSSRFProtection: false,
      });
      const refreshToolList = jest.spyOn(connection, 'refreshToolList').mockResolvedValue();
      const getMany = jest.fn().mockResolvedValue(new Map([['dynamic', connection]]));
      mockAppConnections({ getMany });
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        dynamic: {
          type: 'streamable-http',
          url: 'http://localhost/mcp',
          source: 'yaml',
        },
        public: {
          type: 'streamable-http',
          url: 'https://public.example.com/mcp',
          source: 'user',
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.connectAppServers();

      expect(getMany).toHaveBeenCalledWith(['dynamic'], {
        continueOnError: true,
        refreshTools: false,
      });
      expect(refreshToolList).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnectAppServers', () => {
    it('waits for every loaded app connection to disconnect', async () => {
      const disconnectAll = jest.fn().mockReturnValue([Promise.resolve(), Promise.resolve()]);
      mockAppConnections({ disconnectAll });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.disconnectAppServers();

      expect(disconnectAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatInstructionsForContext', () => {
    it('should return empty string when no servers have instructions', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        server1: { type: 'stdio', command: 'test', args: [] },
        server2: { type: 'stdio', command: 'test2', args: [] },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.formatInstructionsForContext();

      expect(result).toBe('');
    });

    it('should format instructions from multiple servers', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        github: {
          type: 'sse',
          url: 'https://api.github.com',
          serverInstructions: 'Use GitHub API with care',
        },
        files: {
          type: 'stdio',
          command: 'node',
          args: ['files.js'],
          serverInstructions: 'Only read/write files in allowed directories',
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.formatInstructionsForContext();

      expect(result).toContain('# MCP Server Instructions');
      expect(result).toContain('## github MCP Server Instructions');
      expect(result).toContain('Use GitHub API with care');
      expect(result).toContain('## files MCP Server Instructions');
      expect(result).toContain('Only read/write files in allowed directories');
    });

    it('should filter instructions by server names when provided', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        github: {
          type: 'sse',
          url: 'https://api.github.com',
          serverInstructions: 'Use GitHub API with care',
        },
        files: {
          type: 'stdio',
          command: 'node',
          args: ['files.js'],
          serverInstructions: 'Only read/write files in allowed directories',
        },
        database: {
          type: 'stdio',
          command: 'node',
          args: ['db.js'],
          serverInstructions: 'Be careful with database operations',
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.formatInstructionsForContext(['github', 'database']);

      expect(result).toContain('## github MCP Server Instructions');
      expect(result).toContain('Use GitHub API with care');
      expect(result).toContain('## database MCP Server Instructions');
      expect(result).toContain('Be careful with database operations');
      expect(result).not.toContain('files');
      expect(result).not.toContain('Only read/write files in allowed directories');
    });

    it('should handle servers with null or undefined instructions', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        github: {
          type: 'sse',
          url: 'https://api.github.com',
          serverInstructions: 'Use GitHub API with care',
        },
        files: {
          type: 'stdio',
          command: 'node',
          args: ['files.js'],
          serverInstructions: null,
        },
        database: {
          type: 'stdio',
          command: 'node',
          args: ['db.js'],
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.formatInstructionsForContext();

      expect(result).toContain('## github MCP Server Instructions');
      expect(result).toContain('Use GitHub API with care');
      expect(result).not.toContain('files');
      expect(result).not.toContain('database');
    });

    it('should return empty string when filtered servers have no instructions', async () => {
      (mockRegistryInstance.getAllServerConfigs as jest.Mock).mockResolvedValue({
        github: {
          type: 'sse',
          url: 'https://api.github.com',
          serverInstructions: 'Use GitHub API with care',
        },
        files: {
          type: 'stdio',
          command: 'node',
          args: ['files.js'],
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.formatInstructionsForContext(['files']);

      expect(result).toBe('');
    });
  });

  describe('getServerToolFunctions', () => {
    it('should catch and handle errors gracefully', async () => {
      (MCPServerInspector.getToolFunctions as jest.Mock) = jest.fn(() => {
        throw new Error('Connection failed');
      });

      mockAppConnections({
        has: jest.fn().mockResolvedValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        expect.any(Error),
      );
    });

    it('should catch synchronous errors from getUserConnections', async () => {
      (MCPServerInspector.getToolFunctions as jest.Mock) = jest.fn().mockResolvedValue({});

      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const spy = jest.spyOn(manager, 'getUserConnections').mockImplementation(() => {
        throw new Error('Failed to get user connections');
      });

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${serverName}`,
        expect.any(Error),
      );
      expect(spy).toHaveBeenCalled();
    });

    it('should return tools successfully when no errors occur', async () => {
      const expectedTools: t.LCAvailableTools = {
        [`test_tool_mcp_${serverName}`]: {
          type: 'function',
          function: {
            name: `test_tool_mcp_${serverName}`,
            description: 'Test tool',
            parameters: { type: 'object' },
          },
        },
      };

      (MCPServerInspector.getToolFunctions as jest.Mock) = jest
        .fn()
        .mockResolvedValue(expectedTools);

      mockAppConnections({
        has: jest.fn().mockResolvedValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const result = await manager.getServerToolFunctions(userId, serverName);

      expect(result).toEqual(expectedTools);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should include specific server name in error messages', async () => {
      const specificServerName = 'github_mcp_server';

      (MCPServerInspector.getToolFunctions as jest.Mock) = jest.fn(() => {
        throw new Error('Server specific error');
      });

      mockAppConnections({
        has: jest.fn().mockResolvedValue(true),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig(specificServerName));

      const result = await manager.getServerToolFunctions(userId, specificServerName);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `[getServerToolFunctions] Error getting tool functions for server ${specificServerName}`,
        expect.any(Error),
      );
    });

    it('uses a user connection when an effective overlay shadows an app server', async () => {
      const overlayConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://tenant.example.com/mcp',
        source: 'yaml',
        startup: false,
      };
      const overlayConnection = {} as MCPConnection;
      const expectedTools: t.LCAvailableTools = {
        overlay_mcp_test_server: {
          type: 'function',
          function: {
            name: 'overlay_mcp_test_server',
            description: 'Overlay tool',
            parameters: { type: 'object' },
          },
        },
      };
      const appGet = jest.fn().mockResolvedValue({} as MCPConnection);
      mockAppConnections({ get: appGet });
      (mockRegistryInstance.isAppServerConfig as jest.Mock).mockResolvedValue(false);
      (MCPServerInspector.getToolFunctions as jest.Mock).mockResolvedValue(expectedTools);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const internals = manager as unknown as {
        userConnections: Map<string, Map<string, MCPConnection>>;
      };
      internals.userConnections.set(userId, new Map([[serverName, overlayConnection]]));

      await expect(
        manager.getServerToolFunctionsSnapshot(userId, serverName, overlayConfig),
      ).resolves.toEqual({ tools: expectedTools, publicationGeneration: undefined });
      expect(appGet).not.toHaveBeenCalled();
      expect(MCPServerInspector.getToolFunctions).toHaveBeenCalledWith(
        serverName,
        overlayConnection,
      );
    });
  });

  describe('callTool - Activity Tracking', () => {
    const mockUser = { id: 'activity-user' } as IUser;
    const mockFlowManager = {} as Parameters<MCPManager['callTool']>[0]['flowManager'];
    const serverConfig: t.SSEOptions = {
      type: 'sse',
      url: 'https://api.example.com',
    };

    function createConnection(): MCPConnection {
      return {
        isConnected: jest.fn().mockResolvedValue(true),
        setRequestHeaders: jest.fn(),
        timeout: 30000,
        client: {
          request: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Tool result' }],
            isError: false,
          }),
        },
      } as unknown as MCPConnection;
    }

    function getManagerInternals(manager: MCPManager): {
      userConnections: Map<string, Map<string, MCPConnection>>;
      updateUserLastActivity: (trackedUserId: string) => void;
    } {
      return manager as unknown as {
        userConnections: Map<string, Map<string, MCPConnection>>;
        updateUserLastActivity: (trackedUserId: string) => void;
      };
    }

    beforeEach(() => {
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options) => options,
      );
    });

    it('updates activity when a cached connection is replaced during an in-flight call', async () => {
      const manager = new MCPManager();
      const activeConnection = createConnection();
      const replacementConnection = createConnection();
      const internals = getManagerInternals(manager);
      internals.userConnections.set(mockUser.id, new Map([[serverName, replacementConnection]]));
      jest.spyOn(manager, 'getConnection').mockResolvedValue(activeConnection);
      const releaseDetached = jest
        .spyOn(manager, 'releaseDetachedUserConnection')
        .mockResolvedValue(false);
      const updateActivity = jest.spyOn(internals, 'updateUserLastActivity');

      await manager.callTool({
        user: mockUser,
        serverName,
        serverConfig,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager,
      });

      expect(updateActivity).toHaveBeenCalledWith(mockUser.id);
      expect(releaseDetached).toHaveBeenCalledWith(mockUser.id, serverName, activeConnection);
    });

    it('does not create activity entries for app-shared connections', async () => {
      const manager = new MCPManager();
      const appConnection = createConnection();
      const internals = getManagerInternals(manager);
      jest.spyOn(manager, 'getConnection').mockResolvedValue(appConnection);
      const updateActivity = jest.spyOn(internals, 'updateUserLastActivity');

      await manager.callTool({
        user: mockUser,
        serverName,
        serverConfig,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager,
      });

      expect(updateActivity).not.toHaveBeenCalled();
      expect(manager.getConnectionStats().activityEntries).toBe(0);
    });

    it('opens the connection inside the current-authority bind wrapper', async () => {
      const manager = new MCPManager();
      const connection = createConnection();
      const getConnection = jest.spyOn(manager, 'getConnection').mockResolvedValue(connection);
      let wrapperCalls = 0;
      const bindWithCurrentAuthority = async <Result>(
        bind: () => Promise<Result>,
      ): Promise<Result> => {
        wrapperCalls++;
        expect(getConnection).not.toHaveBeenCalled();
        const result = await bind();
        expect(getConnection).toHaveBeenCalledTimes(1);
        return result;
      };

      await manager.callTool({
        user: mockUser,
        serverName,
        serverConfig,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager,
        bindWithCurrentAuthority,
      });

      expect(wrapperCalls).toBe(1);
      expect(connection.client.request).toHaveBeenCalledTimes(1);
    });

    it('does not open a connection when the current-authority bind wrapper rejects', async () => {
      const manager = new MCPManager();
      const getConnection = jest.spyOn(manager, 'getConnection');

      await expect(
        manager.callTool({
          user: mockUser,
          serverName,
          serverConfig,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager,
          bindWithCurrentAuthority: async () => {
            throw new Error('revoked before connect');
          },
        }),
      ).rejects.toThrow('revoked before connect');

      expect(getConnection).not.toHaveBeenCalled();
    });

    it('propagates stable MCP-unavailable state before any manager effect', async () => {
      const manager = new MCPManager();
      const getConnection = jest.spyOn(manager, 'getConnection');
      const unavailable = Object.assign(new Error('authority consistency is unavailable'), {
        code: 'MCP_UNAVAILABLE',
        reason: 'authority_consistency_unavailable',
        status: 503,
      });

      await expect(
        manager.callTool({
          ...issuedConnectionInput(serverConfig),
          user: mockUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager,
          bindWithCurrentAuthority: async () => {
            throw unavailable;
          },
        }),
      ).rejects.toMatchObject({
        code: 'MCP_UNAVAILABLE',
        reason: 'authority_consistency_unavailable',
        status: 503,
      });

      expect(getConnection).not.toHaveBeenCalled();
      expect(mockResolveOboToken).not.toHaveBeenCalled();
    });

    it('runs the host authority fence before request preparation and the remote tool call', async () => {
      const manager = new MCPManager();
      const connection = createConnection();
      const beforeExecute = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(manager, 'getConnection').mockResolvedValue(connection);

      await manager.callTool({
        user: mockUser,
        serverName,
        serverConfig,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager,
        beforeExecute,
      });

      expect(beforeExecute).toHaveBeenCalledTimes(1);
      expect(connection.setRequestHeaders).toHaveBeenCalledTimes(1);
      expect(beforeExecute.mock.invocationCallOrder[0]).toBeLessThan(
        (connection.setRequestHeaders as jest.Mock).mock.invocationCallOrder[0],
      );
      expect(beforeExecute.mock.invocationCallOrder[0]).toBeLessThan(
        (connection.client.request as jest.Mock).mock.invocationCallOrder[0],
      );
    });

    it('does not send a remote tool request when the host authority fence rejects', async () => {
      const manager = new MCPManager();
      const connection = createConnection();
      jest.spyOn(manager, 'getConnection').mockResolvedValue(connection);

      await expect(
        manager.callTool({
          user: mockUser,
          serverName,
          serverConfig,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager,
          beforeExecute: jest.fn().mockRejectedValue(new Error('revoked')),
        }),
      ).rejects.toThrow('revoked');

      expect(connection.client.request).not.toHaveBeenCalled();
    });

    it('executes the exact remote request inside the current-authority wrapper', async () => {
      const manager = new MCPManager();
      const connection = createConnection();
      let wrapperCalls = 0;
      const executeWithCurrentAuthority = async <Result>(
        execute: () => Promise<Result>,
      ): Promise<Result> => {
        wrapperCalls++;
        expect(connection.client.request).not.toHaveBeenCalled();
        const result = await execute();
        expect(connection.client.request).toHaveBeenCalledTimes(1);
        return result;
      };
      jest.spyOn(manager, 'getConnection').mockResolvedValue(connection);

      await manager.callTool({
        user: mockUser,
        serverName,
        serverConfig,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager,
        executeWithCurrentAuthority,
      });

      expect(wrapperCalls).toBe(1);
    });

    it('does not send a remote request when the current-authority wrapper rejects', async () => {
      const manager = new MCPManager();
      const connection = createConnection();
      jest.spyOn(manager, 'getConnection').mockResolvedValue(connection);

      await expect(
        manager.callTool({
          user: mockUser,
          serverName,
          serverConfig,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager,
          executeWithCurrentAuthority: async () => {
            throw new Error('revoked');
          },
        }),
      ).rejects.toThrow('revoked');

      expect(connection.client.request).not.toHaveBeenCalled();
    });
  });

  describe('callTool - Graph Token Integration', () => {
    const mockUser: Partial<IUser> = {
      id: 'user-123',
      provider: 'openid',
      openidId: 'oidc-sub-456',
    };

    const mockFlowManager = {
      getState: jest.fn(),
      setState: jest.fn(),
      clearState: jest.fn(),
    };

    const mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      refreshToolList: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      setRequestHeaders: jest.fn(),
      timeout: 30000,
      client: {
        request: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Tool result' }],
          isError: false,
        }),
      },
    } as unknown as MCPConnection;

    const mockGraphTokenResolver: GraphTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'resolved-graph-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://graph.microsoft.com/.default',
    });

    function createServerConfigWithGraphPlaceholder(): t.SSEOptions {
      return {
        type: 'sse',
        url: 'https://api.example.com',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
          'Content-Type': 'application/json',
        },
      };
    }

    beforeEach(() => {
      jest.clearAllMocks();

      // Mock preProcessGraphTokens to simulate token resolution
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options, graphOptions) => {
          if (
            options.headers?.Authorization?.includes('{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}') &&
            graphOptions.graphTokenResolver
          ) {
            return {
              ...options,
              headers: {
                ...options.headers,
                Authorization: 'Bearer resolved-graph-token',
              },
            };
          }
          return options;
        },
      );
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);
    });

    it('uses the issued materialized Graph config without minting again', async () => {
      const serverConfig = createServerConfigWithGraphPlaceholder();
      const effectiveServerConfig = {
        ...serverConfig,
        headers: {
          ...serverConfig.headers,
          Authorization: 'Bearer resolved-graph-token',
        },
      };

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, effectiveServerConfig),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({ Authorization: 'Bearer resolved-graph-token' }),
      );
    });

    it('should resolve graph token placeholders in headers before tool call', async () => {
      const serverConfig = createServerConfigWithGraphPlaceholder();
      const effectiveServerConfig = {
        ...serverConfig,
        headers: {
          ...serverConfig.headers,
          Authorization: 'Bearer resolved-graph-token',
        },
      };

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, effectiveServerConfig),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      // Verify the connection received the resolved headers
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer resolved-graph-token',
        }),
      );
    });

    it('should attach request OAuth handler without reprocessing resolved config', async () => {
      const rawServerConfig = {
        type: 'sse',
        url: 'https://api.example.com/{{LIBRECHAT_USER_ID}}',
        headers: {
          Authorization: 'Bearer {{USER_TOKEN}}',
        },
        requiresOAuth: true,
        oauth: {
          authorization_url: 'https://auth.example.com/authorize',
        },
      } as t.ParsedServerConfig;
      const processedServerConfig = {
        ...rawServerConfig,
        url: 'https://api.example.com/user-123',
        headers: {
          Authorization: 'Bearer ${SHOULD_NOT_EXPAND}',
        },
      };
      const cleanupOAuthHandler = jest.fn();
      const refreshAuthorityLifecycle = {
        exchange: jest.fn(async (action) => await action()),
        store: jest.fn(async (_tokens, action) => await action()),
        accept: jest.fn(async () => undefined),
      } as t.MCPRefreshAuthorityLifecycle;

      mockProcessMCPEnv.mockReturnValue(processedServerConfig);
      (MCPConnectionFactory.attachRequestOAuthHandler as jest.Mock).mockReturnValue(
        cleanupOAuthHandler,
      );
      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(rawServerConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const oauthStart = jest.fn();

      await manager.callTool({
        ...issuedConnectionInput(rawServerConfig, processedServerConfig, 'oauth'),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        oauthStart,
        refreshAuthorityLifecycle,
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
      });

      expect(mockProcessMCPEnv).not.toHaveBeenCalled();
      expect(MCPConnectionFactory.attachRequestOAuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: processedServerConfig,
          skipEnvProcessing: true,
        }),
        expect.objectContaining({
          oauthStart,
          user: mockUser,
          refreshAuthorityLifecycle,
        }),
        mockConnection,
      );
      expect(cleanupOAuthHandler).toHaveBeenCalled();
    });

    it('should leave graph token placeholders sandboxed for user-sourced configs', async () => {
      const serverConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://api.example.com',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
        source: 'user',
        dbId: 'user-server-id',
      };

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        }),
      );
    });

    it('should pass options unchanged when no graphTokenResolver is provided', async () => {
      const serverConfig: t.SSEOptions = {
        type: 'sse',
        url: 'https://api.example.com',
        headers: {
          Authorization: 'Bearer static-token',
        },
      };

      // Reset mock to return options unchanged
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options) => options,
      );

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        // No graphTokenResolver provided
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
    });

    it('fails closed when issued Graph credentials are not materialized', async () => {
      const serverConfig = createServerConfigWithGraphPlaceholder();

      // Simulate resolution failure - returns original value unchanged
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options) => options,
      );

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await expect(
        manager.callTool({
          ...issuedConnectionInput(serverConfig),
          user: mockUser as IUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager as unknown as Parameters<
            typeof manager.callTool
          >[0]['flowManager'],
          graphTokenResolver: mockGraphTokenResolver,
        }),
      ).rejects.toThrow('Graph credentials were not materialized by the MCP authority resolver');
      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
      expect(mockConnection.client.request).not.toHaveBeenCalled();
    });

    it('should resolve graph tokens in env variables', async () => {
      const serverConfig: t.StdioOptions = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: {
          GRAPH_TOKEN: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
          OTHER_VAR: 'static-value',
        },
      };

      // Mock resolution for env variables
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(async (options) => {
        if (options.env?.GRAPH_TOKEN?.includes('{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}')) {
          return {
            ...options,
            env: {
              ...options.env,
              GRAPH_TOKEN: 'resolved-graph-token',
            },
          };
        }
        return options;
      });

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, {
          ...serverConfig,
          env: { ...serverConfig.env, GRAPH_TOKEN: 'resolved-graph-token' },
        }),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
    });

    it('should resolve graph tokens in URL', async () => {
      const serverConfig: t.SSEOptions = {
        type: 'sse',
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
      };

      // Mock resolution for URL
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(async (options) => {
        if (options.url?.includes('{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}')) {
          return {
            ...options,
            url: 'https://api.example.com?token=resolved-graph-token',
          };
        }
        return options;
      });

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, {
          ...serverConfig,
          url: 'https://api.example.com?token=resolved-graph-token',
        }),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
    });

    it('should pass scopes from environment variable to preProcessGraphTokens', async () => {
      const originalEnv = process.env.GRAPH_API_SCOPES;
      process.env.GRAPH_API_SCOPES = 'custom.scope.read custom.scope.write';

      const serverConfig = createServerConfigWithGraphPlaceholder();

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, {
          ...serverConfig,
          headers: {
            ...serverConfig.headers,
            Authorization: 'Bearer resolved-graph-token',
          },
        }),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.GRAPH_API_SCOPES = originalEnv;
      } else {
        delete process.env.GRAPH_API_SCOPES;
      }
    });

    it('should work correctly when config has no graph token placeholders', async () => {
      const serverConfig: t.SSEOptions = {
        type: 'sse',
        url: 'https://api.example.com',
        headers: {
          Authorization: 'Bearer static-token',
        },
      };

      // Mock to return unchanged options when no placeholders
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options) => options,
      );

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      const result = await manager.callTool({
        ...issuedConnectionInput(serverConfig),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(result).toBeDefined();
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer static-token',
        }),
      );
    });
  });

  describe('callTool - OBO Integration', () => {
    const mockUser: Partial<IUser> = {
      id: 'user-123',
      provider: 'openid',
      openidId: 'oidc-sub-456',
    };

    const mockFlowManager = {
      getState: jest.fn(),
      setState: jest.fn(),
      clearState: jest.fn(),
    };

    const mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      setRequestHeaders: jest.fn(),
      timeout: 30000,
      client: {
        request: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Tool result' }],
          isError: false,
        }),
      },
    } as unknown as MCPConnection;

    const mockOboTokenResolver = jest.fn();

    const serverConfig: t.SSEOptions & { obo: { scopes: string } } = {
      type: 'sse',
      url: 'https://api.example.com',
      headers: {
        Authorization: 'Bearer bootstrap-token',
      },
      obo: {
        scopes: 'api://mcp-server-id/Mcp.Tools.ReadWrite',
      },
    };

    beforeEach(() => {
      mockResolveOboToken.mockReset();
    });

    it('should bypass shared app connections for OBO servers and use a user-scoped connection', async () => {
      const sharedAppConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        setRequestHeaders: jest.fn(),
        timeout: 30000,
        client: {
          request: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Shared tool result' }],
            isError: false,
          }),
        },
      } as unknown as MCPConnection;

      const userConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        setRequestHeaders: jest.fn(),
        timeout: 30000,
        client: {
          request: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'User tool result' }],
            isError: false,
          }),
        },
      } as unknown as MCPConnection;

      const appConnections = {
        get: jest.fn().mockResolvedValue(sharedAppConnection),
      };

      mockResolveOboToken.mockResolvedValue({
        access_token: 'fresh-obo-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600_000,
      });

      mockAppConnections(appConnections);
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest
        .spyOn(manager, 'getUserConnection')
        .mockResolvedValue(userConnection);

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, serverConfig, 'obo'),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        oboTokenResolver: mockOboTokenResolver,
      });

      expect(appConnections.get).not.toHaveBeenCalled();
      expect(getUserConnectionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          serverConfig,
          user: mockUser,
        }),
      );
      expect(userConnection.setRequestHeaders as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer fresh-obo-token',
        }),
      );
      expect(sharedAppConnection.setRequestHeaders as jest.Mock).not.toHaveBeenCalled();
      expect(userConnection.client.request as jest.Mock).toHaveBeenCalled();
      expect(sharedAppConnection.client.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('should replace Authorization with the refreshed OBO token on each tool call', async () => {
      mockResolveOboToken.mockResolvedValue({
        access_token: 'fresh-obo-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600_000,
      });

      const appConnections = {
        get: jest.fn().mockResolvedValue(mockConnection),
      };

      mockAppConnections(appConnections);

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest
        .spyOn(manager, 'getUserConnection')
        .mockResolvedValue(mockConnection);

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, serverConfig, 'obo'),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        oboTokenResolver: mockOboTokenResolver,
      });

      expect(mockResolveOboToken).toHaveBeenCalledWith(
        mockUser,
        serverConfig.obo,
        mockOboTokenResolver,
      );
      expect(appConnections.get).not.toHaveBeenCalled();
      expect(getUserConnectionSpy).toHaveBeenCalled();
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer fresh-obo-token',
        }),
      );
      expect(mockConnection.client.request).toHaveBeenCalled();
    });

    it('mints the OBO token inside the final authority execution fence', async () => {
      const order: string[] = [];
      mockResolveOboToken.mockImplementation(async () => {
        order.push('mint');
        return {
          access_token: 'fenced-obo-token',
          token_type: 'Bearer',
          obtained_at: Date.now(),
          expires_at: Date.now() + 3600_000,
        };
      });
      (mockConnection.client.request as jest.Mock).mockImplementationOnce(async () => {
        order.push('remote-call');
        return {
          content: [{ type: 'text', text: 'Tool result' }],
          isError: false,
        };
      });
      const executeWithCurrentAuthority = jest.fn(async (execute) => {
        order.push('authority-fence');
        return await execute();
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      jest.spyOn(manager, 'getUserConnection').mockResolvedValue(mockConnection);

      await manager.callTool({
        ...issuedConnectionInput(serverConfig, serverConfig, 'obo'),
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        oboTokenResolver: mockOboTokenResolver,
        executeWithCurrentAuthority,
      });

      expect(order).toEqual(['authority-fence', 'mint', 'remote-call']);
    });

    it('fails closed before minting OBO for a user-authored server without author trust proof', async () => {
      const userAuthoredServerConfig = {
        ...serverConfig,
        source: 'user',
        dbId: 'server-record-id',
        author: 'server-author-id',
      } as t.ParsedServerConfig;
      mockResolveOboToken.mockResolvedValue({
        access_token: 'unproved-obo-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600_000,
      });
      mockAppConnections({ get: jest.fn().mockResolvedValue(mockConnection) });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      jest.spyOn(manager, 'getUserConnection').mockResolvedValue(mockConnection);

      await expect(
        manager.callTool({
          ...issuedConnectionInput(userAuthoredServerConfig, userAuthoredServerConfig, 'obo'),
          user: mockUser as IUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager as unknown as Parameters<
            typeof manager.callTool
          >[0]['flowManager'],
          oboTokenResolver: mockOboTokenResolver,
        }),
      ).rejects.toThrow('OBO author trust proof is required');

      expect(mockResolveOboToken).not.toHaveBeenCalled();
      expect(mockConnection.client.request).not.toHaveBeenCalled();
    });

    it('should fail closed with a retryable message when per-call OBO refresh has a transient failure', async () => {
      mockResolveOboToken.mockRejectedValue(
        new OboTokenResolutionError(
          'exchange_failed',
          'Temporary OBO token exchange failure.',
          true,
        ),
      );

      const appConnections = {
        get: jest.fn().mockResolvedValue(mockConnection),
      };

      mockAppConnections(appConnections);

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest
        .spyOn(manager, 'getUserConnection')
        .mockResolvedValue(mockConnection);

      await expect(
        manager.callTool({
          ...issuedConnectionInput(serverConfig, serverConfig, 'obo'),
          user: mockUser as IUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager as unknown as Parameters<
            typeof manager.callTool
          >[0]['flowManager'],
          oboTokenResolver: mockOboTokenResolver,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Temporary OBO token exchange failure.'),
      });

      expect(appConnections.get).not.toHaveBeenCalled();
      expect(getUserConnectionSpy).toHaveBeenCalled();
      expect(mockConnection.setRequestHeaders).not.toHaveBeenCalled();
      expect(mockConnection.client.request).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[test_tool] Tool call failed'),
        expect.anything(),
      );
    });

    it('should fail closed with a re-authentication message when per-call OBO refresh has a permanent failure', async () => {
      mockResolveOboToken.mockRejectedValue(
        new OboTokenResolutionError(
          'exchange_failed',
          'The identity provider rejected the OBO token exchange.',
        ),
      );

      const appConnections = {
        get: jest.fn().mockResolvedValue(mockConnection),
      };

      mockAppConnections(appConnections);

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest
        .spyOn(manager, 'getUserConnection')
        .mockResolvedValue(mockConnection);

      await expect(
        manager.callTool({
          ...issuedConnectionInput(serverConfig, serverConfig, 'obo'),
          user: mockUser as IUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager as unknown as Parameters<
            typeof manager.callTool
          >[0]['flowManager'],
          oboTokenResolver: mockOboTokenResolver,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('verify the configured OBO scopes'),
      });

      expect(appConnections.get).not.toHaveBeenCalled();
      expect(getUserConnectionSpy).toHaveBeenCalled();
      expect(mockConnection.setRequestHeaders).not.toHaveBeenCalled();
      expect(mockConnection.client.request).not.toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    const mockUser: Partial<IUser> = {
      id: 'user-123',
      provider: 'openid',
      openidId: 'oidc-sub-456',
    };

    it('should continue using shared app connections for non-OBO servers', async () => {
      const appConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      } as unknown as MCPConnection;

      const appConnections = {
        get: jest.fn().mockResolvedValue(appConnection),
      };

      const nonOboConfig: t.SSEOptions = {
        type: 'sse',
        url: 'https://api.example.com',
      };

      mockAppConnections(appConnections);
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(nonOboConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest.spyOn(manager, 'getUserConnection');

      const connection = await manager.getConnection({
        ...issuedConnectionInput(nonOboConfig),
        serverName,
        user: mockUser as IUser,
      });

      expect(connection).toBe(appConnection);
      expect(appConnections.get).toHaveBeenCalledWith(serverName);
      expect(getUserConnectionSpy).not.toHaveBeenCalled();
    });

    it('uses isolated discovery and execution when a tenant policy differs from a global app connection', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-cross-tenant-provenance-key';
      const nonOboConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://api.example.com',
        source: 'yaml',
      };
      const appRequest = jest.fn();
      const appDisconnect = jest.fn();
      const appConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        fetchTools: jest.fn(),
        disconnect: appDisconnect,
        client: { request: appRequest },
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: null,
              userId: '__app__',
              serverName,
              serverConfig: nonOboConfig,
              effectiveServerConfig: nonOboConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: null,
                allowedAddresses: null,
              }),
              authorizationIdentity: 'none',
            },
            'app',
          ),
        ),
      } as unknown as MCPConnection;
      const appProvenance = appConnection.getDiscoveryProvenance();
      const tenantUser = { ...mockUser, tenantId: 'tenant-c' } as IUser;
      const tenantPolicy = {
        allowedDomains: ['tenant-c.example.com'],
        allowedAddresses: null,
      };
      const isolatedProvenance = createMCPConnectionProvenance(
        {
          tenantId: 'tenant-c',
          userId: tenantUser.id,
          serverName,
          serverConfig: nonOboConfig,
          effectiveServerConfig: nonOboConfig,
          securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity(tenantPolicy),
          authorizationIdentity: 'none',
        },
        'user',
      );
      const isolatedRequest = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Tenant-isolated tool result' }],
        isError: false,
      });
      const isolatedConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        getDiscoveryProvenance: jest.fn().mockReturnValue(isolatedProvenance),
        setRequestHeaders: jest.fn(),
        disconnect: jest.fn(),
        timeout: 30000,
        client: { request: isolatedRequest },
      } as unknown as MCPConnection;
      const appConnections = {
        has: jest.fn().mockResolvedValue(true),
        get: jest.fn().mockResolvedValue(appConnection),
      };

      mockAppConnections(appConnections);
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(nonOboConfig);
      (mockRegistryInstance.resolveAllowlists as jest.Mock).mockImplementation(
        async ({ tenantId }: { tenantId?: string | null }) => ({
          allowedDomains: tenantId === 'tenant-c' ? ['tenant-c.example.com'] : null,
          allowedAddresses: null,
          useSSRFProtection: false,
        }),
      );
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(
        async (options) => options,
      );
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(isolatedConnection);
      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: [{ name: 'tenant_tool', inputSchema: { type: 'object' } }],
        connection: null,
        oauthRequired: false,
        oauthUrl: null,
        provenance: isolatedProvenance,
      });

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());

        await expect(
          manager.getConnection({
            ...issuedConnectionInput(nonOboConfig, nonOboConfig, 'none', appProvenance!.scope),
            serverName,
            user: { ...mockUser, tenantId: 'tenant-a' } as IUser,
          }),
        ).resolves.toBe(appConnection);
        await expect(
          manager.getConnection({
            ...issuedConnectionInput(nonOboConfig, nonOboConfig, 'none', appProvenance!.scope),
            serverName,
            user: { ...mockUser, tenantId: 'tenant-b' } as IUser,
          }),
        ).resolves.toBe(appConnection);

        await expect(
          manager.getUserConnection({
            serverName,
            user: tenantUser,
            serverConfig: nonOboConfig,
          }),
        ).rejects.toThrow('Trying to create user-specific connection for app-level server');

        const tenantSecurityPolicy = { ...tenantPolicy, useSSRFProtection: false };
        const discovery = await manager.discoverServerTools({
          ...issuedConnectionInput(nonOboConfig, nonOboConfig, 'none', isolatedProvenance!.scope),
          securityPolicy: tenantSecurityPolicy,
          serverName,
          user: tenantUser,
        });
        await manager.callTool({
          ...issuedConnectionInput(nonOboConfig, nonOboConfig, 'none', isolatedProvenance!.scope),
          securityPolicy: tenantSecurityPolicy,
          user: tenantUser,
          serverName,
          serverConfig: nonOboConfig,
          toolName: 'tenant_tool',
          provider: 'openai',
          flowManager: {} as Parameters<MCPManager['callTool']>[0]['flowManager'],
        });

        expect(discovery.tools).toEqual([{ name: 'tenant_tool', inputSchema: { type: 'object' } }]);
        expect(MCPConnectionFactory.discoverTools).toHaveBeenCalledWith(
          expect.objectContaining({
            serverName,
            allowedDomains: tenantPolicy.allowedDomains,
          }),
          expect.objectContaining({ user: tenantUser }),
        );
        expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            serverName,
            allowedDomains: tenantPolicy.allowedDomains,
          }),
          expect.objectContaining({ user: tenantUser }),
        );
        expect(isolatedRequest).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'tools/call' }),
          expect.anything(),
          expect.anything(),
        );
        expect(appConnection.fetchTools).not.toHaveBeenCalled();
        expect(appRequest).not.toHaveBeenCalled();
        expect(appDisconnect).not.toHaveBeenCalled();
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('should use user-scoped connections for trusted runtime context placeholders', async () => {
      const appConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      } as unknown as MCPConnection;
      const userConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      } as unknown as MCPConnection;
      const appConnections = {
        get: jest.fn().mockResolvedValue(appConnection),
      };
      const runtimeHeaderConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp',
        source: 'yaml',
        headers: {
          'X-LibreChat-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
        },
      };

      mockAppConnections(appConnections);
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeHeaderConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const getUserConnectionSpy = jest
        .spyOn(manager, 'getUserConnection')
        .mockResolvedValue(userConnection);

      const connection = await manager.getConnection({
        ...issuedConnectionInput(runtimeHeaderConfig, {
          ...runtimeHeaderConfig,
          headers: { 'X-LibreChat-User-Email': 'user@example.com' },
        }),
        serverName,
        user: mockUser as IUser,
      });

      expect(connection).toBe(userConnection);
      expect(appConnections.get).not.toHaveBeenCalled();
      expect(getUserConnectionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          serverConfig: runtimeHeaderConfig,
          user: mockUser,
        }),
      );
    });
  });

  describe('discoverServerTools', () => {
    const mockTools = [
      { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Second tool', inputSchema: { type: 'object' } },
    ];

    const mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      fetchTools: jest.fn().mockResolvedValue(mockTools),
      fetchToolsSnapshot: jest.fn().mockResolvedValue({ tools: mockTools, complete: true }),
      fetchOrderedToolsSnapshot: jest.fn().mockResolvedValue({ tools: mockTools, complete: true }),
      disconnect: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockResolvedValue(undefined),
    } as unknown as MCPConnection;

    beforeEach(() => {
      (MCPConnectionFactory.discoverTools as jest.Mock) = jest.fn();
    });

    it('should return tools from existing app connection when available', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-shared-discovery-key';
      const appConfig = {
        type: 'stdio',
        command: 'test',
        args: [],
      } satisfies t.ParsedServerConfig;
      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(appConfig);
      const appProvenance = createMCPConnectionProvenance(
        {
          tenantId: null,
          userId: '__app__',
          serverName,
          serverConfig: appConfig,
          effectiveServerConfig: appConfig,
          securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
            allowedDomains: null,
            allowedAddresses: null,
          }),
          authorizationIdentity: 'none',
        },
        'app',
      );
      mockConnection.getDiscoveryProvenance = jest.fn().mockReturnValue(appProvenance);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const result = await manager.discoverServerTools({
          ...issuedConnectionInput(appConfig, appConfig, 'none', appProvenance!.scope),
          serverName,
        });

        expect(result.tools).toEqual(mockTools);
        expect(result.oauthRequired).toBe(false);
        expect(result.oauthUrl).toBeNull();
        expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('rejects a shared app discovery response when tenant policy differs', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-discovery-policy-key';
      const appConfig = {
        type: 'stdio',
        command: 'test',
        args: [],
      } satisfies t.ParsedServerConfig;
      const appConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        fetchTools: jest.fn().mockResolvedValue(mockTools),
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: null,
              userId: '__app__',
              serverName,
              serverConfig: appConfig,
              effectiveServerConfig: appConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: null,
                allowedAddresses: null,
              }),
              authorizationIdentity: 'none',
            },
            'app',
          ),
        ),
      } as unknown as MCPConnection;
      const isolatedTools = [{ name: 'isolated', inputSchema: { type: 'object' } }];
      mockAppConnections({
        get: jest.fn().mockResolvedValue(appConnection),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(appConfig);
      mockGetTenantId.mockReturnValue('tenant-a');
      (mockRegistryInstance.resolveAllowlists as jest.Mock).mockResolvedValue({
        allowedDomains: ['tenant-only.example.com'],
        allowedAddresses: null,
        useSSRFProtection: true,
      });
      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: isolatedTools,
        connection: null,
        oauthRequired: false,
        oauthUrl: null,
        provenance: null,
      });

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const result = await manager.discoverServerTools({
          ...issuedConnectionInput(appConfig),
          securityPolicy: {
            allowedDomains: ['tenant-only.example.com'],
            allowedAddresses: null,
            useSSRFProtection: true,
          },
          serverName,
          user: { id: 'tenant-user' } as IUser,
        });

        expect(result.tools).toEqual(isolatedTools);
        expect(appConnection.fetchTools).not.toHaveBeenCalled();
        expect(MCPConnectionFactory.discoverTools).toHaveBeenCalled();
        expect(mockRegistryInstance.resolveAllowlists).not.toHaveBeenCalled();
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('should use MCPConnectionFactory.discoverTools when no app connection available', async () => {
      const discoveryConnection = {
        disconnect: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'stdio',
        command: 'test',
        args: [],
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: discoveryConnection,
        oauthRequired: false,
        oauthUrl: null,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig),
        serverName,
      });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(false);
      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalled();
      expect(discoveryConnection.dispose).toHaveBeenCalledTimes(1);
    });

    it('should forward runtime context to discoverTools in the non-OAuth path', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' } as unknown as IUser;
      const customUserVars = { MY_CUSTOM_KEY: 'c527bd0abc123' };
      const graphTokenResolver = jest.fn();

      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://my-mcp.server.com?key={{MY_CUSTOM_KEY}}',
      };
      const effectiveServerConfig: t.ParsedServerConfig = {
        ...serverConfig,
        url: `https://my-mcp.server.com?key=${customUserVars.MY_CUSTOM_KEY}`,
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: null,
        oauthRequired: false,
        oauthUrl: null,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig, effectiveServerConfig),
        serverName,
        user: mockUser,
        customUserVars,
        requestBody: { conversationId: 'conv-123' } as t.ToolDiscoveryOptions['requestBody'],
        graphTokenResolver,
        connectionTimeout: 10000,
      });

      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName,
          serverConfig: expect.objectContaining({
            url: `https://my-mcp.server.com?key=${customUserVars.MY_CUSTOM_KEY}`,
          }),
        }),
        expect.objectContaining({
          user: mockUser,
          customUserVars,
          requestBody: { conversationId: 'conv-123' },
          connectionTimeout: 10000,
        }),
      );
    });

    it('should not discover BODY-scoped servers without request body context', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig),
        serverName,
      });

      expect(result).toEqual({
        tools: null,
        oauthRequired: false,
        oauthUrl: null,
        provenance: null,
      });
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Request body field(s) required'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('messageId'));
    });

    it('fails closed instead of reading a missing discovery config from the registry', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(null);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(manager.discoverServerTools({ serverName })).rejects.toThrow(
        'Proof-bound discovery input is required',
      );
      expect(mockRegistryInstance.getServerConfig).not.toHaveBeenCalled();
    });

    it('should treat configured oauth as OAuth when requiresOAuth is unset', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://api.example.com',
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig, serverConfig, 'oauth'),
        serverName,
      });

      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(true);
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
    });

    it('should return OAuth info when server requires OAuth but no user provided', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://api.example.com',
        requiresOAuth: true,
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig, serverConfig, 'oauth'),
        serverName,
      });

      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('OAuth server requires user and flowManager'),
      );
    });

    it('should discover tools with OAuth when user and flowManager provided', async () => {
      const mockUser = { id: 'user123', email: 'test@example.com' } as unknown as IUser;
      const mockFlowManager = {
        createFlow: jest.fn(),
        getFlowState: jest.fn(),
        deleteFlow: jest.fn(),
      };
      const refreshAuthorityLifecycle = {
        exchange: jest.fn(async (action) => await action()),
        store: jest.fn(async (_tokens, action) => await action()),
        accept: jest.fn(async () => undefined),
      } as t.MCPRefreshAuthorityLifecycle;

      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://api.example.com',
        requiresOAuth: true,
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: null,
        oauthRequired: true,
        oauthUrl: 'https://auth.example.com/authorize',
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        ...issuedConnectionInput(serverConfig, serverConfig, 'oauth'),
        serverName,
        user: mockUser,
        flowManager: mockFlowManager as unknown as t.ToolDiscoveryOptions['flowManager'],
        graphTokenResolver: jest.fn(),
        refreshAuthorityLifecycle,
      });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(true);
      expect(result.oauthUrl).toBe('https://auth.example.com/authorize');
      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.objectContaining({
          user: mockUser,
          useOAuth: true,
          refreshAuthorityLifecycle,
        }),
      );
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ graphTokenResolver: expect.anything() }),
      );
    });
  });

  describe('getUserConnection - useOAuth derivation', () => {
    const mockUser = { id: userId, email: 'test@example.com' } as unknown as IUser;
    const mockFlowManager = {
      createFlow: jest.fn(),
      getFlowState: jest.fn(),
      deleteFlow: jest.fn(),
    };
    const mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      isStale: jest.fn().mockReturnValue(false),
      disconnect: jest.fn().mockResolvedValue(undefined),
      refreshToolList: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    } as unknown as MCPConnection;

    it('should pass useOAuth for servers with configured oauth and no requiresOAuth value', async () => {
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'sse',
        url: 'https://oauth-mcp.example.com',
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      });

      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        serverName,
        user: mockUser,
        flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
      });

      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.objectContaining({ useOAuth: true }),
      );
    });

    it('passes the captured OAuth authority scope to the connection factory', async () => {
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });

      const serverConfig: t.ParsedServerConfig = {
        type: 'sse',
        url: 'https://oauth-mcp.example.com',
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      };
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);
      const oauthAuthorityScope = {
        tenant: 'tenant-revision',
        principal: 'principal-revision',
        server: 'server-revision',
        policy: 'policy-revision',
        config: 'config-revision',
        credentials: 'credential-revision',
      };
      const refreshAuthorityLifecycle = {
        exchange: jest.fn(async (action) => await action()),
        store: jest.fn(async (_tokens, action) => await action()),
        accept: jest.fn(async () => undefined),
      } as t.MCPRefreshAuthorityLifecycle;

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        ...issuedConnectionInput(serverConfig, serverConfig, 'oauth', oauthAuthorityScope),
        serverName,
        user: mockUser,
        refreshAuthorityLifecycle,
        flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
      });

      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.objectContaining({
          useOAuth: true,
          oauthAuthorityScope,
          refreshAuthorityLifecycle,
        }),
      );
    });

    it('should not pass useOAuth for servers with requiresOAuth: false', async () => {
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'http://private-mcp.svc:5446/mcp',
        requiresOAuth: false,
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      });

      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        serverName,
        user: mockUser,
      });

      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.not.objectContaining({ useOAuth: true }),
      );
    });

    it('reuses OBO connections with non-catalog lifecycle provenance', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-obo-lifecycle-key';
      const oboConfig = {
        type: 'streamable-http',
        url: 'https://obo.example.com/mcp',
        requiresOAuth: false,
        obo: { scopes: 'api://mcp/.default' },
      } satisfies t.ParsedServerConfig;
      const oboTokenResolver = jest.fn();
      const provenance = createMCPConnectionProvenance(
        {
          tenantId: null,
          userId,
          serverName,
          serverConfig: oboConfig,
          effectiveServerConfig: oboConfig,
          securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
            allowedDomains: null,
            allowedAddresses: null,
          }),
          authorizationIdentity: MCP_OBO_CONNECTION_AUTHORIZATION_IDENTITY,
        },
        'user',
      );
      const oboConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        disconnect: jest.fn(),
        getDiscoveryProvenance: jest.fn().mockReturnValue(provenance),
      } as unknown as MCPConnection;
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(oboConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(oboConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const options = {
          serverName,
          user: mockUser,
          flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
          oboTokenResolver,
        };

        const first = await manager.getUserConnection(options);
        const second = await manager.getUserConnection(options);

        expect(first).toBe(oboConnection);
        expect(second).toBe(oboConnection);
        expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(1);
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('does not coalesce concurrent connections across tenant, policy, and credential scopes', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-pending-scope-key';
      const customConfig = {
        type: 'streamable-http',
        url: 'https://private.example.com/mcp',
        customUserVars: { API_KEY: { title: 'API key', description: 'API key' } },
        headers: { Authorization: 'Bearer {{API_KEY}}' },
      } satisfies t.ParsedServerConfig;
      const tenantAUser = { ...mockUser, tenantId: 'tenant-a', role: 'USER' } as IUser;
      const tenantBUser = { ...mockUser, tenantId: 'tenant-b', role: 'ADMIN' } as IUser;
      const policyForTenant = (tenantId: string) => ({
        allowedDomains: [`${tenantId}.example.com`],
        allowedAddresses: null,
      });
      const makeProvenance = (user: IUser, customUserVars: Record<string, string>) =>
        createMCPConnectionProvenance(
          {
            tenantId: user.tenantId ?? null,
            userId,
            serverName,
            serverConfig: customConfig,
            effectiveServerConfig: customConfig,
            securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity(
              policyForTenant(user.tenantId!),
            ),
            customUserVars,
            authorizationIdentity: 'none',
          },
          'user',
        );
      const tenantAConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest
          .fn()
          .mockReturnValue(makeProvenance(tenantAUser, { API_KEY: 'key-a' })),
      } as unknown as MCPConnection;
      const joinedTenantAConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest
          .fn()
          .mockReturnValue(makeProvenance(tenantAUser, { API_KEY: 'key-a' })),
      } as unknown as MCPConnection;
      const tenantBConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest
          .fn()
          .mockReturnValue(makeProvenance(tenantBUser, { API_KEY: 'key-b' })),
      } as unknown as MCPConnection;
      let releaseTenantA: () => void = () => undefined;
      const tenantAGate = new Promise<void>((resolve) => {
        releaseTenantA = resolve;
      });

      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(customConfig);
      (mockRegistryInstance.resolveAllowlists as jest.Mock).mockImplementation(
        async ({ tenantId }: { tenantId?: string | null }) => ({
          ...policyForTenant(tenantId ?? 'default'),
          useSSRFProtection: false,
        }),
      );
      let tenantACreations = 0;
      (MCPConnectionFactory.create as jest.Mock).mockImplementation(
        async (_basic, options: t.UserConnectionContext) => {
          if (options.user?.tenantId === 'tenant-a') {
            tenantACreations += 1;
            if (tenantACreations === 1) {
              await tenantAGate;
              return tenantAConnection;
            }
            return joinedTenantAConnection;
          }
          return tenantBConnection;
        },
      );

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const firstPromise = manager.getUserConnection({
          serverName,
          serverConfig: customConfig,
          user: tenantAUser,
          customUserVars: { API_KEY: 'key-a' },
        });
        for (
          let i = 0;
          i < 20 && (MCPConnectionFactory.create as jest.Mock).mock.calls.length < 1;
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        const joinedFirstPromise = manager.getUserConnection({
          serverName,
          serverConfig: customConfig,
          user: tenantAUser,
          customUserVars: { API_KEY: 'key-a' },
        });
        const secondPromise = manager.getUserConnection({
          serverName,
          serverConfig: customConfig,
          user: tenantBUser,
          customUserVars: { API_KEY: 'key-b' },
        });
        for (
          let i = 0;
          i < 20 && (MCPConnectionFactory.create as jest.Mock).mock.calls.length < 2;
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }

        expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(2);
        await expect(secondPromise).resolves.toBe(tenantBConnection);
        releaseTenantA();
        await expect(firstPromise).resolves.toBe(tenantAConnection);
        await expect(joinedFirstPromise).resolves.toBe(joinedTenantAConnection);
        expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(3);
        expect(manager.getUserConnections(userId)?.get(serverName)).toBe(tenantBConnection);
        expect(tenantAConnection.disconnect).not.toHaveBeenCalled();
        expect(joinedTenantAConnection.disconnect).not.toHaveBeenCalled();
        expect(tenantBConnection.disconnect).not.toHaveBeenCalled();
        expect(manager.getConnectionStats().totalConnections).toBe(3);

        await expect(
          Promise.all([
            manager.releaseDetachedUserConnection(userId, serverName, tenantAConnection),
            manager.releaseDetachedUserConnection(userId, serverName, tenantAConnection),
          ]),
        ).resolves.toEqual([true, true]);
        expect(tenantAConnection.disconnect).toHaveBeenCalledTimes(1);
        expect(joinedTenantAConnection.disconnect).not.toHaveBeenCalled();
        expect(tenantBConnection.disconnect).not.toHaveBeenCalled();
        expect(manager.getConnectionStats().totalConnections).toBe(2);
        await expect(
          manager.releaseDetachedUserConnection(userId, serverName, tenantAConnection),
        ).resolves.toBe(false);
        expect(tenantAConnection.disconnect).toHaveBeenCalledTimes(1);
        expect(await joinedTenantAConnection.isConnected()).toBe(true);
        await expect(
          manager.releaseDetachedUserConnection(userId, serverName, joinedTenantAConnection),
        ).resolves.toBe(true);
        expect(joinedTenantAConnection.disconnect).toHaveBeenCalledTimes(1);
        expect(manager.getConnectionStats().totalConnections).toBe(1);

        await manager.disconnectUserConnection(userId, serverName);
        expect(tenantBConnection.disconnect).toHaveBeenCalledTimes(1);
        expect(manager.getUserConnections(userId)).toBeUndefined();
      } finally {
        releaseTenantA();
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('serializes repeated same-scope force-new replacements', async () => {
      const config = {
        type: 'streamable-http',
        url: 'https://private.example.com/mcp',
      } satisfies t.ParsedServerConfig;
      const user = { ...mockUser, tenantId: 'tenant-a', role: 'USER' } as IUser;
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(config);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const createConnection = () =>
        ({
          isConnected: jest.fn().mockResolvedValue(true),
          disconnect: jest.fn().mockResolvedValue(undefined),
          dispose: jest.fn().mockResolvedValue(undefined),
          removeAllListeners: jest.fn(),
          on: jest.fn(),
        }) as unknown as MCPConnection;
      const firstConnection = createConnection();
      const secondConnection = createConnection();
      let releaseFirst: (connection: MCPConnection) => void = () => undefined;
      const delayedFirst = new Promise<MCPConnection>((resolve) => {
        releaseFirst = resolve;
      });
      (MCPConnectionFactory.create as jest.Mock)
        .mockReturnValueOnce(delayedFirst)
        .mockResolvedValueOnce(secondConnection);

      const options = {
        forceNew: true,
        serverName,
        serverConfig: config,
        user,
      };
      const firstPromise = manager.getUserConnection(options);
      const secondPromise = manager.getUserConnection(options);
      for (
        let i = 0;
        i < 20 && (MCPConnectionFactory.create as jest.Mock).mock.calls.length < 1;
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(1);

      releaseFirst(firstConnection);
      await expect(firstPromise).resolves.toBe(firstConnection);
      await expect(secondPromise).resolves.toBe(secondConnection);

      expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(2);
      expect(firstConnection.removeAllListeners).toHaveBeenCalledWith('toolsChanged');
      expect(firstConnection.dispose).toHaveBeenCalledTimes(1);
      expect(manager.getUserConnections(userId)?.get(serverName)).toBe(secondConnection);
      await expect(
        manager.releaseDetachedUserConnection(userId, serverName, firstConnection),
      ).resolves.toBe(false);
      expect(manager.getConnectionStats().totalConnections).toBe(1);
      await manager.disconnectUserConnection(userId, serverName);
      expect(secondConnection.dispose).toHaveBeenCalledTimes(1);
      expect(manager.getConnectionStats().totalConnections).toBe(0);
    });

    it('preserves the successful scoped connection when a concurrent replacement fails', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-pending-failure-ownership-key';
      const customConfig = {
        type: 'streamable-http',
        url: 'https://private.example.com/mcp',
        customUserVars: { API_KEY: { title: 'API key', description: 'API key' } },
        headers: { Authorization: 'Bearer {{API_KEY}}' },
      } satisfies t.ParsedServerConfig;
      const tenantAUser = { ...mockUser, tenantId: 'tenant-a', role: 'USER' } as IUser;
      const tenantBUser = { ...mockUser, tenantId: 'tenant-b', role: 'ADMIN' } as IUser;
      const policyForTenant = (tenantId: string) => ({
        allowedDomains: [`${tenantId}.example.com`],
        allowedAddresses: null,
      });
      const tenantAFailedConnection = {
        isConnected: jest.fn().mockResolvedValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const tenantBConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: 'tenant-b',
              userId,
              serverName,
              serverConfig: customConfig,
              effectiveServerConfig: customConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity(
                policyForTenant('tenant-b'),
              ),
              customUserVars: { API_KEY: 'key-b' },
              authorizationIdentity: 'none',
            },
            'user',
          ),
        ),
      } as unknown as MCPConnection;
      let releaseTenantA: () => void = () => undefined;
      const tenantAGate = new Promise<void>((resolve) => {
        releaseTenantA = resolve;
      });

      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(customConfig);
      (mockRegistryInstance.resolveAllowlists as jest.Mock).mockImplementation(
        async ({ tenantId }: { tenantId?: string | null }) => ({
          ...policyForTenant(tenantId ?? 'default'),
          useSSRFProtection: false,
        }),
      );
      (MCPConnectionFactory.create as jest.Mock).mockImplementation(
        async (_basic, options: t.UserConnectionContext) => {
          if (options.user?.tenantId === 'tenant-a') {
            await tenantAGate;
            return tenantAFailedConnection;
          }
          return tenantBConnection;
        },
      );

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const firstPromise = manager.getUserConnection({
          serverName,
          serverConfig: customConfig,
          user: tenantAUser,
          customUserVars: { API_KEY: 'key-a' },
        });
        for (
          let i = 0;
          i < 20 && (MCPConnectionFactory.create as jest.Mock).mock.calls.length < 1;
          i++
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        const secondPromise = manager.getUserConnection({
          serverName,
          serverConfig: customConfig,
          user: tenantBUser,
          customUserVars: { API_KEY: 'key-b' },
        });

        await expect(secondPromise).resolves.toBe(tenantBConnection);
        releaseTenantA();
        await expect(firstPromise).rejects.toThrow(
          'Failed to establish connection after initialization attempt',
        );

        expect(manager.getUserConnections(userId)?.get(serverName)).toBe(tenantBConnection);
        expect(tenantAFailedConnection.disconnect).toHaveBeenCalledTimes(1);
        expect(tenantBConnection.disconnect).not.toHaveBeenCalled();
      } finally {
        releaseTenantA();
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('does not remove or disconnect a newer owner during stale cleanup', async () => {
      const provenance = (credentials: string): t.MCPConnectionProvenance => ({
        version: 1,
        principalKind: 'user',
        authorizationKind: 'none',
        scope: {
          tenant: 'tenant',
          principal: 'principal',
          server: 'server',
          policy: 'policy',
          config: 'config',
          credentials,
        },
      });
      let releaseDisconnect: () => void = () => undefined;
      const disconnectGate = new Promise<void>((resolve) => {
        releaseDisconnect = resolve;
      });
      const staleProvenance = provenance('stale');
      const staleConnection = {
        disconnect: jest.fn(() => disconnectGate),
        getDiscoveryProvenance: jest.fn().mockReturnValue(staleProvenance),
      } as unknown as MCPConnection;
      const currentConnection = {
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest.fn().mockReturnValue(provenance('current')),
      } as unknown as MCPConnection;

      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const internals = manager as unknown as {
        userConnections: Map<string, Map<string, MCPConnection>>;
      };
      const userMap = new Map([[serverName, staleConnection]]);
      internals.userConnections.set(userId, userMap);

      const cleanup = manager.disconnectUserConnection(userId, serverName, staleConnection);
      await Promise.resolve();
      expect(staleConnection.disconnect).toHaveBeenCalledTimes(1);
      userMap.set(serverName, currentConnection);
      releaseDisconnect();
      await cleanup;

      expect(userMap.get(serverName)).toBe(currentConnection);
      await manager.disconnectUserConnectionIfProvenanceMatches(
        userId,
        serverName,
        staleProvenance,
      );
      expect(currentConnection.disconnect).not.toHaveBeenCalled();
      expect(userMap.get(serverName)).toBe(currentConnection);
    });

    it('replaces a cached user connection after custom credentials rotate', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-custom-credential-rotation-key';
      const customConfig = {
        type: 'streamable-http',
        url: 'https://private.example.com/mcp',
        customUserVars: { API_KEY: { title: 'API key', description: 'API key' } },
        headers: { Authorization: 'Bearer {{API_KEY}}' },
      } satisfies t.ParsedServerConfig;
      const staleConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: null,
              userId,
              serverName,
              serverConfig: customConfig,
              effectiveServerConfig: customConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: null,
                allowedAddresses: null,
              }),
              customUserVars: { API_KEY: 'old-key' },
              authorizationIdentity: 'none',
            },
            'user',
          ),
        ),
      } as unknown as MCPConnection;
      const replacementConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      } as unknown as MCPConnection;
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(replacementConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const internals = manager as unknown as {
          userConnections: Map<string, Map<string, MCPConnection>>;
        };
        internals.userConnections.set(userId, new Map([[serverName, staleConnection]]));

        await expect(
          manager.getUserConnection({
            serverName,
            serverConfig: customConfig,
            user: mockUser,
            customUserVars: { API_KEY: 'new-key' },
          }),
        ).resolves.toBe(replacementConnection);

        expect(staleConnection.disconnect).toHaveBeenCalled();
        expect(MCPConnectionFactory.create).toHaveBeenCalled();
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('replaces a cached OAuth connection after a cross-replica regrant', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'manager-oauth-regrant-key';
      const oauthConfig = {
        type: 'streamable-http',
        url: 'https://protected.example.com/mcp',
        requiresOAuth: true,
      } satisfies t.ParsedServerConfig;
      const staleConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: null,
              userId,
              serverName,
              serverConfig: oauthConfig,
              effectiveServerConfig: oauthConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: null,
                allowedAddresses: null,
              }),
              authorizationIdentity: 'grant-a',
            },
            'user',
          ),
        ),
      } as unknown as MCPConnection;
      const replacementConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      } as unknown as MCPConnection;
      const findTokens = jest.fn().mockResolvedValue([
        {
          type: 'mcp_oauth_client',
          identifier: `mcp:${serverName}:client`,
          metadata: new Map([['credential_set_id', 'grant-b']]),
        },
      ]);
      const tokenMethods = {
        findToken: jest.fn(),
        findTokens,
        createToken: jest.fn(),
        updateToken: jest.fn(),
        deleteTokens: jest.fn(),
      } as unknown as NonNullable<t.UserMCPConnectionOptions['tokenMethods']>;
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(replacementConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const internals = manager as unknown as {
          userConnections: Map<string, Map<string, MCPConnection>>;
        };
        internals.userConnections.set(userId, new Map([[serverName, staleConnection]]));

        await expect(
          manager.getUserConnection({
            serverName,
            serverConfig: oauthConfig,
            user: mockUser,
            flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
            tokenMethods,
          }),
        ).resolves.toBe(replacementConnection);

        expect(findTokens).toHaveBeenCalledTimes(1);
        expect(staleConnection.disconnect).toHaveBeenCalled();
        expect(MCPConnectionFactory.create).toHaveBeenCalled();
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('should detect OAuth after resolving trusted runtime URL placeholders', async () => {
      const originalCredsKey = process.env.CREDS_KEY;
      process.env.CREDS_KEY = 'runtime-oauth-reuse-key';
      const runtimeUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/users/{{LIBRECHAT_USER_ID}}/mcp',
        source: 'yaml',
      };
      const runtimeOAuthConfig = { ...runtimeUrlConfig, requiresOAuth: true };
      const runtimeEffectiveConfig = {
        ...runtimeOAuthConfig,
        url: `https://api.example.com/users/${userId}/mcp`,
      };
      const runtimeConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        disconnect: jest.fn().mockResolvedValue(undefined),
        getDiscoveryProvenance: jest.fn().mockReturnValue(
          createMCPConnectionProvenance(
            {
              tenantId: null,
              userId,
              serverName,
              serverConfig: runtimeOAuthConfig,
              effectiveServerConfig: runtimeEffectiveConfig,
              securityPolicyIdentity: createMCPToolCatalogSecurityPolicyIdentity({
                allowedDomains: null,
                allowedAddresses: null,
              }),
              authorizationIdentity: 'grant-runtime',
            },
            'user',
            'oauth',
          ),
        ),
      } as unknown as MCPConnection;
      const tokenMethods = {
        findToken: jest.fn(),
        findTokens: jest.fn().mockResolvedValue([
          {
            type: 'mcp_oauth_client',
            identifier: `mcp:${serverName}:client`,
            metadata: new Map([['credential_set_id', 'grant-runtime']]),
          },
        ]),
        createToken: jest.fn(),
        updateToken: jest.fn(),
        deleteTokens: jest.fn(),
      } as unknown as NonNullable<t.UserMCPConnectionOptions['tokenMethods']>;
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeUrlConfig);
      (graphUtils.preProcessGraphTokens as jest.Mock).mockImplementation(async (config) => config);
      mockProcessMCPEnv.mockImplementation(({ options, user }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace('{{LIBRECHAT_USER_ID}}', user?.id ?? ''),
        }),
      }));
      mockDetectOAuthRequirement.mockResolvedValue({
        requiresOAuth: true,
        method: 'protected-resource-metadata',
      });
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(runtimeConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const options = {
          serverName,
          user: mockUser,
          flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
          tokenMethods,
        };
        await manager.getUserConnection(options);
        await expect(manager.getUserConnection(options)).resolves.toBe(runtimeConnection);

        expect(mockDetectOAuthRequirement).toHaveBeenCalledWith(
          'https://api.example.com/users/test-user-123/mcp',
          null,
          null,
        );
        expect(mockDetectOAuthRequirement).toHaveBeenCalledTimes(1);
        expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(1);
        expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            serverConfig: expect.objectContaining({
              requiresOAuth: true,
            }),
          }),
          expect.objectContaining({ useOAuth: true }),
        );
      } finally {
        if (originalCredsKey == null) {
          delete process.env.CREDS_KEY;
        } else {
          process.env.CREDS_KEY = originalCredsKey;
        }
      }
    });

    it('should reject disallowed runtime URLs before OAuth detection probes them', async () => {
      const runtimeUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://{{LIBRECHAT_BODY_CONVERSATIONID}}.example.com/mcp',
        source: 'yaml',
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeUrlConfig);
      (mockRegistryInstance.getAllowedDomains as jest.Mock).mockReturnValue(['*.example.com']);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace(
            '{{LIBRECHAT_BODY_CONVERSATIONID}}',
            body?.conversationId ?? '',
          ),
        }),
      }));
      mockIsMCPDomainAllowed.mockResolvedValue(false);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(
        manager.getUserConnection({
          serverName,
          user: mockUser,
          requestBody: { conversationId: 'evil.com/path' },
          flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
        }),
      ).rejects.toThrow('not allowed by the configured domain policy');

      expect(mockDetectOAuthRequirement).not.toHaveBeenCalled();
      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    });

    it('should reject resolved runtime URLs that fail MCP domain policy', async () => {
      const runtimeUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://{{LIBRECHAT_BODY_CONVERSATIONID}}.example.com/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeUrlConfig);
      (mockRegistryInstance.getAllowedDomains as jest.Mock).mockReturnValue(['*.example.com']);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace(
            '{{LIBRECHAT_BODY_CONVERSATIONID}}',
            body?.conversationId ?? '',
          ),
        }),
      }));
      mockIsMCPDomainAllowed.mockResolvedValue(false);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(
        manager.getUserConnection({
          serverName,
          user: mockUser,
          requestBody: { conversationId: 'evil.com/path' },
        }),
      ).rejects.toThrow('not allowed by the configured domain policy');

      expect(mockIsMCPDomainAllowed).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://evil.com/path.example.com/mcp',
        }),
        ['*.example.com'],
        null,
      );
      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    });

    it('should validate resolved runtime URLs without passing resolved configs to the factory', async () => {
      const runtimeUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://{{LIBRECHAT_BODY_CONVERSATIONID}}.example.com/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeUrlConfig);
      (mockRegistryInstance.getAllowedDomains as jest.Mock).mockReturnValue(['*.example.com']);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace(
            '{{LIBRECHAT_BODY_CONVERSATIONID}}',
            body?.conversationId ?? '',
          ),
        }),
      }));
      mockIsMCPDomainAllowed.mockResolvedValue(true);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        serverName,
        user: mockUser,
        requestBody: { conversationId: 'tenant-a' },
      });

      expect(mockIsMCPDomainAllowed).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://tenant-a.example.com/mcp',
        }),
        ['*.example.com'],
        null,
      );
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: expect.objectContaining({
            url: 'https://{{LIBRECHAT_BODY_CONVERSATIONID}}.example.com/mcp',
          }),
        }),
        expect.objectContaining({
          requestBody: { conversationId: 'tenant-a' },
        }),
      );
    });

    it('should keep graph placeholders unresolved for user-sourced connection configs', async () => {
      const graphConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp',
        source: 'user',
        dbId: 'user-server-id',
        requiresOAuth: false,
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(graphConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        serverName,
        user: mockUser,
        graphTokenResolver: jest.fn(),
      });

      expect(graphUtils.preProcessGraphTokens).not.toHaveBeenCalled();
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: expect.objectContaining({
            headers: {
              Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
            },
          }),
        }),
        expect.any(Object),
      );
    });

    it('should not cache connections when request body placeholders affect the URL', async () => {
      const bodyUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      const firstConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
      } as unknown as MCPConnection;
      const secondConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
      } as unknown as MCPConnection;

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(bodyUrlConfig);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace('{{LIBRECHAT_BODY_MESSAGEID}}', body?.messageId ?? ''),
        }),
      }));
      (MCPConnectionFactory.create as jest.Mock)
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const first = await manager.getUserConnection({
        serverName,
        user: mockUser,
        requestBody: { messageId: 'message-1' },
      });
      const second = await manager.getUserConnection({
        serverName,
        user: mockUser,
        requestBody: { messageId: 'message-2' },
      });

      expect(first).toBe(firstConnection);
      expect(second).toBe(secondConnection);
      expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(2);
    });

    it('should reuse BODY-scoped connections within a request-scoped connection store', async () => {
      const bodyUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      const requestScopedConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        on: jest.fn(),
      } as unknown as MCPConnection;
      const requestScopedConnections: t.RequestScopedMCPConnectionStore = {
        connections: new Map(),
        pending: new Map(),
      };

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(bodyUrlConfig);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace('{{LIBRECHAT_BODY_MESSAGEID}}', body?.messageId ?? ''),
        }),
      }));
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(requestScopedConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const first = await manager.getUserConnection({
        serverName,
        user: mockUser,
        requestBody: { messageId: 'message-1' },
        requestScopedConnections,
      });
      const second = await manager.getUserConnection({
        serverName,
        user: mockUser,
        requestBody: { messageId: 'message-1' },
        requestScopedConnections,
      });

      expect(first).toBe(requestScopedConnection);
      expect(second).toBe(requestScopedConnection);
      expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(1);
      expect(requestScopedConnections.connections.get(`${mockUser.id}:${serverName}`)).toBe(
        requestScopedConnection,
      );
    });

    it('should not clear server cooldowns for ephemeral runtime connections', async () => {
      const bodyUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      const clearCooldownSpy = jest.spyOn(MCPConnection, 'clearCooldown');

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(bodyUrlConfig);
      mockProcessMCPEnv.mockImplementation(({ options, body }) => ({
        ...options,
        ...('url' in options && {
          url: options.url?.replace('{{LIBRECHAT_BODY_MESSAGEID}}', body?.messageId ?? ''),
        }),
      }));
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({
          serverName,
          user: mockUser,
          requestBody: { messageId: 'message-1' },
        });

        expect(clearCooldownSpy).not.toHaveBeenCalled();
      } finally {
        clearCooldownSpy.mockRestore();
      }
    });

    it('should still clear server cooldowns for explicit forceNew connections', async () => {
      const staticConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };
      const clearCooldownSpy = jest.spyOn(MCPConnection, 'clearCooldown');

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(staticConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({
          serverName,
          user: mockUser,
          forceNew: true,
        });

        expect(clearCooldownSpy).toHaveBeenCalledWith(serverName);
      } finally {
        clearCooldownSpy.mockRestore();
      }
    });

    it('should reject BODY-scoped connections without request body context', async () => {
      const bodyUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(bodyUrlConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(
        manager.getUserConnection({
          serverName,
          user: mockUser,
        }),
      ).rejects.toThrow('Request body field(s) required');

      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    });

    it('should reject BODY-scoped connections when a referenced body field is missing', async () => {
      const bodyUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
        requiresOAuth: false,
      };

      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(bodyUrlConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(
        manager.getUserConnection({
          serverName,
          user: mockUser,
          requestBody: { conversationId: 'conv-123' },
        }),
      ).rejects.toThrow('messageId');

      expect(MCPConnectionFactory.create).not.toHaveBeenCalled();
    });

    it('should throw when OAuth server lacks flowManager', async () => {
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'sse',
        url: 'https://oauth-mcp.example.com',
        requiresOAuth: true,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await expect(
        manager.getUserConnection({
          serverName,
          user: mockUser,
        }),
      ).rejects.toThrow('requires a flowManager');
    });
  });
});
