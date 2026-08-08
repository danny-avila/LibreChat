import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { GraphTokenResolver } from '~/utils/graph';
import type * as t from '~/mcp/types';
import { OboTokenResolutionError, detectOAuthRequirement, resolveOboToken } from '~/mcp/oauth';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { isMCPDomainAllowed } from '~/auth/domain';
import * as toolsChanged from '~/mcp/toolsChanged';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';
import * as graphUtils from '~/utils/graph';
import { processMCPEnv } from '~/utils/env';

// Mock external dependencies
jest.mock('@librechat/data-schemas', () => ({
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
      getAll: jest.fn().mockResolvedValue(new Map()),
      getMany: jest.fn().mockResolvedValue(new Map()),
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

    it('should call preProcessGraphTokens with graphTokenResolver when provided', async () => {
      const serverConfig = createServerConfigWithGraphPlaceholder();

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          user: mockUser,
          graphTokenResolver: mockGraphTokenResolver,
        }),
      );
    });

    it('should resolve graph token placeholders in headers before tool call', async () => {
      const serverConfig = createServerConfigWithGraphPlaceholder();

      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);

      const manager = await MCPManager.createInstance(newMCPServersConfig());

      await manager.callTool({
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
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        oauthStart,
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
      });

      /** Runtime resolution, config-identity binding, and callTool each process once — none from
       * attaching the request handler. */
      expect(mockProcessMCPEnv).toHaveBeenCalledTimes(3);
      expect(MCPConnectionFactory.attachRequestOAuthHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: processedServerConfig,
          skipEnvProcessing: true,
        }),
        expect.objectContaining({
          oauthStart,
          user: mockUser,
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
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        // No graphTokenResolver provided
      });

      // Verify preProcessGraphTokens was still called (to check for placeholders)
      expect(graphUtils.preProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          user: mockUser,
          graphTokenResolver: undefined,
        }),
      );
    });

    it('should handle graph token resolution failure gracefully', async () => {
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

      // Should not throw, even when token resolution fails
      await expect(
        manager.callTool({
          user: mockUser as IUser,
          serverName,
          toolName: 'test_tool',
          provider: 'openai',
          flowManager: mockFlowManager as unknown as Parameters<
            typeof manager.callTool
          >[0]['flowManager'],
          graphTokenResolver: mockGraphTokenResolver,
        }),
      ).resolves.toBeDefined();

      // Headers should contain the unresolved placeholder
      expect(mockConnection.setRequestHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        }),
      );
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
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          graphTokenResolver: mockGraphTokenResolver,
        }),
      );
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
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          graphTokenResolver: mockGraphTokenResolver,
        }),
      );
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
        user: mockUser as IUser,
        serverName,
        toolName: 'test_tool',
        provider: 'openai',
        flowManager: mockFlowManager as unknown as Parameters<
          typeof manager.callTool
        >[0]['flowManager'],
        graphTokenResolver: mockGraphTokenResolver,
      });

      expect(graphUtils.preProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          scopes: 'custom.scope.read custom.scope.write',
        }),
      );

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
        serverName,
        user: mockUser as IUser,
      });

      expect(connection).toBe(appConnection);
      expect(appConnections.get).toHaveBeenCalledWith(serverName);
      expect(getUserConnectionSpy).not.toHaveBeenCalled();
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
      mockAppConnections({
        get: jest.fn().mockResolvedValue(mockConnection),
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(false);
      expect(result.oauthUrl).toBeNull();
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
    });

    it('should use MCPConnectionFactory.discoverTools when no app connection available', async () => {
      const discoveryConnection = {
        disconnect: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'stdio',
        command: 'test',
        args: [],
      });

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: discoveryConnection,
        oauthRequired: false,
        oauthUrl: null,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

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

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://my-mcp.server.com?key={{MY_CUSTOM_KEY}}',
      });

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: null,
        oauthRequired: false,
        oauthUrl: null,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.discoverServerTools({
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
            url: 'https://my-mcp.server.com?key={{MY_CUSTOM_KEY}}',
          }),
        }),
        expect.objectContaining({
          user: mockUser,
          customUserVars,
          requestBody: { conversationId: 'conv-123' },
          graphTokenResolver,
          connectionTimeout: 10000,
        }),
      );
    });

    it('should not discover BODY-scoped servers without request body context', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://api.example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        source: 'yaml',
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

      expect(result).toEqual({ tools: null, oauthRequired: false, oauthUrl: null });
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Request body field(s) required'),
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('messageId'));
    });

    it('should return null tools when server config not found', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(null);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Server config not found'),
      );
    });

    it('should treat configured oauth as OAuth when requiresOAuth is unset', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'sse',
        url: 'https://api.example.com',
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(true);
      expect(MCPConnectionFactory.discoverTools).not.toHaveBeenCalled();
    });

    it('should return OAuth info when server requires OAuth but no user provided', async () => {
      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'sse',
        url: 'https://api.example.com',
        requiresOAuth: true,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

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

      mockAppConnections({
        get: jest.fn().mockResolvedValue(null),
      });

      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'sse',
        url: 'https://api.example.com',
        requiresOAuth: true,
      });

      (MCPConnectionFactory.discoverTools as jest.Mock).mockResolvedValue({
        tools: mockTools,
        connection: null,
        oauthRequired: true,
        oauthUrl: 'https://auth.example.com/authorize',
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({
        serverName,
        user: mockUser,
        flowManager: mockFlowManager as unknown as t.ToolDiscoveryOptions['flowManager'],
        graphTokenResolver: jest.fn(),
      });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(true);
      expect(result.oauthUrl).toBe('https://auth.example.com/authorize');
      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.objectContaining({
          user: mockUser,
          useOAuth: true,
          graphTokenResolver: expect.any(Function),
        }),
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

    it('routes tool-list snapshots from user connections to the user-scoped publisher', async () => {
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/{{LIBRECHAT_BODY_CONVERSATIONID}}',
        source: 'yaml',
        requiresOAuth: false,
      };
      const tools: t.MCPTool[] = [{ name: 'dynamic', inputSchema: { type: 'object' } }];
      const notifySpy = jest
        .spyOn(toolsChanged, 'notifyMCPToolsChanged')
        .mockResolvedValue(undefined);
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      mockProcessMCPEnv.mockImplementation(({ options }) => ({
        ...options,
        url: 'https://mcp.example.com/conversation-1',
      }));
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({
          serverName,
          user: mockUser,
          requestBody: { conversationId: 'conversation-1' },
        });

        const listener = (mockConnection.on as jest.Mock).mock.calls.find(
          ([eventName]) => eventName === 'toolsChanged',
        )?.[1];
        expect(listener).toEqual(expect.any(Function));
        listener(tools);

        expect(notifySpy).toHaveBeenCalledWith({
          tools,
          userId,
          serverName,
          serverConfig,
        });
      } finally {
        notifySpy.mockRestore();
      }
    });

    it('refreshes a newly recreated durable user connection after subscribing', async () => {
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      });
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({ serverName, user: mockUser });

      expect(mockConnection.on).toHaveBeenCalledWith('toolsChanged', expect.any(Function));
      expect(mockConnection.refreshToolList).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])(
      'cancels and disposes a pending connection during mutation teardown (forceNew=%s)',
      async (forceNew) => {
        const pendingConnection = {
          isConnected: jest.fn().mockResolvedValue(true),
          isStale: jest.fn().mockReturnValue(false),
          refreshToolList: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
          dispose: jest.fn().mockResolvedValue(undefined),
        } as unknown as MCPConnection;
        let resolveConnection: ((connection: MCPConnection) => void) | undefined;
        const factoryResult = new Promise<MCPConnection>((resolve) => {
          resolveConnection = resolve;
        });
        mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
        (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
          type: 'streamable-http',
          url: 'https://mcp.example.com/old',
          source: 'user',
          dbId: 'server-1',
        });
        (MCPConnectionFactory.create as jest.Mock).mockReturnValue(factoryResult);

        const manager = await MCPManager.createInstance(newMCPServersConfig());
        const creation = manager.getUserConnection({ serverName, user: mockUser, forceNew });
        while ((MCPConnectionFactory.create as jest.Mock).mock.calls.length === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        await manager.disconnectUserConnection(userId, serverName);
        resolveConnection?.(pendingConnection);

        await expect(creation).rejects.toThrow('Connection creation was cancelled during teardown');
        expect(pendingConnection.removeAllListeners).toHaveBeenCalledWith('toolsChanged');
        expect(pendingConnection.dispose).toHaveBeenCalledTimes(1);
        expect(manager.getUserConnections(userId)?.has(serverName) ?? false).toBe(false);
      },
    );

    it('disposes the tracked durable connection before a forced replacement', async () => {
      const createConnection = () =>
        ({
          isConnected: jest.fn().mockResolvedValue(true),
          isStale: jest.fn().mockReturnValue(false),
          refreshToolList: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
          dispose: jest.fn().mockResolvedValue(undefined),
        }) as unknown as MCPConnection;
      const previousConnection = createConnection();
      const replacementConnection = createConnection();
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      });
      (MCPConnectionFactory.create as jest.Mock)
        .mockResolvedValueOnce(previousConnection)
        .mockResolvedValueOnce(replacementConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({ serverName, user: mockUser });
      const result = await manager.getUserConnection({
        serverName,
        user: mockUser,
        forceNew: true,
      });

      expect(previousConnection.removeAllListeners).toHaveBeenCalledWith('toolsChanged');
      expect(previousConnection.dispose).toHaveBeenCalledTimes(1);
      expect((previousConnection.dispose as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (MCPConnectionFactory.create as jest.Mock).mock.invocationCallOrder[1],
      );
      expect(result).toBe(replacementConnection);
      expect(manager.getUserConnections(userId)?.get(serverName)).toBe(replacementConnection);
    });

    it('serializes an ordinary load with multiple queued forced replacements', async () => {
      const createConnection = () =>
        ({
          isConnected: jest.fn().mockResolvedValue(true),
          isStale: jest.fn().mockReturnValue(false),
          refreshToolList: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
          dispose: jest.fn().mockResolvedValue(undefined),
        }) as unknown as MCPConnection;
      const initial = createConnection();
      const firstReplacement = createConnection();
      const secondReplacement = createConnection();
      let resolveFirst: ((connection: MCPConnection) => void) | undefined;
      let resolveSecond: ((connection: MCPConnection) => void) | undefined;
      const firstFactoryResult = new Promise<MCPConnection>((resolve) => {
        resolveFirst = resolve;
      });
      const secondFactoryResult = new Promise<MCPConnection>((resolve) => {
        resolveSecond = resolve;
      });
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      });
      (MCPConnectionFactory.create as jest.Mock)
        .mockResolvedValueOnce(initial)
        .mockReturnValueOnce(firstFactoryResult)
        .mockReturnValueOnce(secondFactoryResult);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({ serverName, user: mockUser });
      const firstForced = manager.getUserConnection({ serverName, user: mockUser, forceNew: true });
      while ((MCPConnectionFactory.create as jest.Mock).mock.calls.length < 2) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      const ordinary = manager.getUserConnection({ serverName, user: mockUser });
      const secondForced = manager.getUserConnection({
        serverName,
        user: mockUser,
        forceNew: true,
      });

      resolveFirst?.(firstReplacement);
      await expect(firstForced).resolves.toBe(firstReplacement);
      await expect(ordinary).resolves.toBe(firstReplacement);
      while ((MCPConnectionFactory.create as jest.Mock).mock.calls.length < 3) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      resolveSecond?.(secondReplacement);

      await expect(secondForced).resolves.toBe(secondReplacement);
      expect(MCPConnectionFactory.create).toHaveBeenCalledTimes(3);
      expect(firstReplacement.dispose).toHaveBeenCalledTimes(1);
      expect(manager.getUserConnections(userId)?.get(serverName)).toBe(secondReplacement);
    });

    it('disposes a retained disconnected connection before recreating it', async () => {
      const createConnection = (connected: boolean) =>
        ({
          isConnected: jest.fn().mockResolvedValue(connected),
          isStale: jest.fn().mockReturnValue(false),
          disconnect: jest.fn().mockResolvedValue(undefined),
          refreshToolList: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
          dispose: jest.fn().mockResolvedValue(undefined),
        }) as unknown as MCPConnection;
      const disconnectedConnection = createConnection(false);
      const replacementConnection = createConnection(true);
      (disconnectedConnection.isConnected as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue({
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      });
      (MCPConnectionFactory.create as jest.Mock)
        .mockResolvedValueOnce(disconnectedConnection)
        .mockResolvedValueOnce(replacementConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({ serverName, user: mockUser });
      const result = await manager.getUserConnection({ serverName, user: mockUser });

      expect(disconnectedConnection.removeAllListeners).toHaveBeenCalledWith('toolsChanged');
      expect(disconnectedConnection.dispose).toHaveBeenCalledTimes(1);
      expect(
        (disconnectedConnection.dispose as jest.Mock).mock.invocationCallOrder[0],
      ).toBeLessThan((MCPConnectionFactory.create as jest.Mock).mock.invocationCallOrder[1]);
      expect(result).toBe(replacementConnection);
      expect(manager.getUserConnections(userId)?.get(serverName)).toBe(replacementConnection);
    });

    it('binds durable tool publications to the generation captured before connection creation', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const notifySpy = jest
        .spyOn(toolsChanged, 'notifyMCPToolsChanged')
        .mockResolvedValue(undefined);
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
        get: jest.fn().mockResolvedValue(null),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);
      const expectedToolFunctions: t.LCAvailableTools = {
        [`current_mcp_${serverName}`]: {
          type: 'function',
          function: {
            name: `current_mcp_${serverName}`,
            description: '',
            parameters: { type: 'object' },
          },
        },
      };
      (MCPServerInspector.getToolFunctions as jest.Mock).mockResolvedValue(expectedToolFunctions);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser });
        const listener = (mockConnection.on as jest.Mock).mock.calls.find(
          ([eventName]) => eventName === 'toolsChanged',
        )?.[1];
        const tools: t.MCPTool[] = [{ name: 'current', inputSchema: { type: 'object' } }];
        listener(tools);
        const snapshot = await manager.getServerToolFunctionsSnapshot(userId, serverName);

        expect(generationSpy).toHaveBeenCalledWith({ userId, serverName });
        expect(snapshot).toEqual({
          tools: expectedToolFunctions,
          publicationGeneration: 'generation-a',
        });
        expect(notifySpy).toHaveBeenCalledWith({
          tools,
          userId,
          serverName,
          serverConfig,
          publicationGeneration: 'generation-a',
        });
      } finally {
        generationSpy.mockRestore();
        notifySpy.mockRestore();
      }
    });

    it('rejects a live snapshot after another replica rotates its publication generation', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValueOnce('generation-a')
        .mockResolvedValue('generation-b');
      const connection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        refreshToolList: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'user',
        dbId: 'server-1',
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(connection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser });

        await expect(
          manager.getServerToolFunctionsSnapshot(userId, serverName, serverConfig),
        ).resolves.toEqual({ tools: null });
        expect(MCPServerInspector.getToolFunctions).not.toHaveBeenCalled();
        expect(connection.dispose).toHaveBeenCalledTimes(1);
      } finally {
        generationSpy.mockRestore();
      }
    });

    it('rejects an old-config connection even when Redis generation rotation failed', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const connection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        refreshToolList: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const oldConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://old.example.com/mcp',
        source: 'user',
        dbId: 'server-1',
      };
      const committedConfig: t.ParsedServerConfig = {
        ...oldConfig,
        url: 'https://new.example.com/mcp',
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(oldConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(connection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser, serverConfig: oldConfig });

        await expect(
          manager.getServerToolFunctionsSnapshot(userId, serverName, committedConfig),
        ).resolves.toEqual({ tools: null });
        expect(MCPServerInspector.getToolFunctions).not.toHaveBeenCalled();
        expect(connection.dispose).toHaveBeenCalledTimes(1);
      } finally {
        generationSpy.mockRestore();
      }
    });

    it('rejects a connection for a deleted config even when Redis generation rotation failed', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const connection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        refreshToolList: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const oldConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://old.example.com/mcp',
        source: 'user',
        dbId: 'server-1',
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(oldConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(connection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser, serverConfig: oldConfig });
        (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(null);

        await expect(manager.getServerToolFunctionsSnapshot(userId, serverName)).resolves.toEqual({
          tools: null,
        });
        expect(MCPServerInspector.getToolFunctions).not.toHaveBeenCalled();
        expect(connection.dispose).toHaveBeenCalledTimes(1);
      } finally {
        generationSpy.mockRestore();
      }
    });

    it('renews the publication lease when an active durable connection is reused', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const renewalSpy = jest
        .spyOn(toolsChanged, 'renewMCPToolsChangedGeneration')
        .mockResolvedValue(true);
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser });
        const internals = manager as unknown as {
          toolPublicationLeaseRefreshes: WeakMap<MCPConnection, number>;
        };
        renewalSpy.mockClear();
        internals.toolPublicationLeaseRefreshes.set(mockConnection, 0);

        await manager.getUserConnection({ serverName, user: mockUser });

        expect(renewalSpy).toHaveBeenCalledWith({
          userId,
          serverName,
          publicationGeneration: 'generation-a',
        });
        expect(renewalSpy).toHaveBeenCalledTimes(1);
      } finally {
        generationSpy.mockRestore();
        renewalSpy.mockRestore();
      }
    });

    it('disposes and rejects a reused connection after lease renewal loses ownership', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const renewalSpy = jest
        .spyOn(toolsChanged, 'renewMCPToolsChangedGeneration')
        .mockResolvedValue(true);
      const connection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        refreshToolList: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(connection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser });
        const internals = manager as unknown as {
          toolPublicationLeaseRefreshes: WeakMap<MCPConnection, number>;
        };
        internals.toolPublicationLeaseRefreshes.set(connection, 0);
        renewalSpy.mockResolvedValue(false);

        await expect(manager.getUserConnection({ serverName, user: mockUser })).rejects.toThrow(
          'Publication lease is no longer current',
        );

        expect(connection.removeAllListeners).toHaveBeenCalledWith('toolsChanged');
        expect(connection.dispose).toHaveBeenCalled();
        expect(manager.getUserConnections(userId)?.has(serverName) ?? false).toBe(false);
      } finally {
        generationSpy.mockRestore();
        renewalSpy.mockRestore();
      }
    });

    it('does not return a reused connection cancelled while its lease renewal is pending', async () => {
      const generationSpy = jest
        .spyOn(toolsChanged, 'getMCPToolsChangedGeneration')
        .mockResolvedValue('generation-a');
      const renewalSpy = jest
        .spyOn(toolsChanged, 'renewMCPToolsChangedGeneration')
        .mockResolvedValue(true);
      let resolveRenewal: ((renewed: boolean) => void) | undefined;
      const pendingRenewal = new Promise<boolean>((resolve) => {
        resolveRenewal = resolve;
      });
      const connection = {
        isConnected: jest.fn().mockResolvedValue(true),
        isStale: jest.fn().mockReturnValue(false),
        refreshToolList: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        removeAllListeners: jest.fn(),
        dispose: jest.fn().mockResolvedValue(undefined),
      } as unknown as MCPConnection;
      const serverConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://mcp.example.com/mcp',
        source: 'yaml',
        startup: false,
      };
      mockAppConnections({ has: jest.fn().mockResolvedValue(false) });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(serverConfig);
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(connection);

      try {
        const manager = await MCPManager.createInstance(newMCPServersConfig());
        await manager.getUserConnection({ serverName, user: mockUser });
        const internals = manager as unknown as {
          toolPublicationLeaseRefreshes: WeakMap<MCPConnection, number>;
        };
        internals.toolPublicationLeaseRefreshes.set(connection, 0);
        renewalSpy.mockClear();
        renewalSpy.mockReturnValue(pendingRenewal);

        const reuse = manager.getUserConnection({ serverName, user: mockUser });
        while (renewalSpy.mock.calls.length === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        await manager.disconnectUserConnection(userId, serverName);
        resolveRenewal?.(true);

        await expect(reuse).rejects.toThrow('Connection creation was cancelled during teardown');
        expect(connection.dispose).toHaveBeenCalled();
      } finally {
        generationSpy.mockRestore();
        renewalSpy.mockRestore();
      }
    });

    it('should detect OAuth after resolving trusted runtime URL placeholders', async () => {
      const runtimeUrlConfig: t.ParsedServerConfig = {
        type: 'streamable-http',
        url: 'https://api.example.com/users/{{LIBRECHAT_USER_ID}}/mcp',
        source: 'yaml',
      };
      mockAppConnections({
        has: jest.fn().mockResolvedValue(false),
      });
      (mockRegistryInstance.getServerConfig as jest.Mock).mockResolvedValue(runtimeUrlConfig);
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
      (MCPConnectionFactory.create as jest.Mock).mockResolvedValue(mockConnection);

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      await manager.getUserConnection({
        serverName,
        user: mockUser,
        flowManager: mockFlowManager as unknown as t.UserMCPConnectionOptions['flowManager'],
      });

      expect(mockDetectOAuthRequirement).toHaveBeenCalledWith(
        'https://api.example.com/users/test-user-123/mcp',
        null,
        null,
      );
      expect(MCPConnectionFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: expect.objectContaining({
            requiresOAuth: true,
          }),
        }),
        expect.objectContaining({ useOAuth: true }),
      );
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
