import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { GraphTokenResolver } from '~/utils/graph';
import type * as t from '~/mcp/types';
import { MCPServersInitializer } from '~/mcp/registry/MCPServersInitializer';
import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { ConnectionsRepository } from '~/mcp/ConnectionsRepository';
import { MCPConnection } from '~/mcp/connection';
import { MCPManager } from '~/mcp/MCPManager';
import * as graphUtils from '~/utils/graph';

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

jest.mock('~/utils/env', () => ({
  processMCPEnv: jest.fn((params) => params.options),
}));

const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  getAllServerConfigs: jest.fn(),
  getOAuthServers: jest.fn(),
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
  });

  function mockAppConnections(
    appConnectionsConfig: Partial<ConnectionsRepository>,
  ): jest.MockedClass<typeof ConnectionsRepository> {
    const mock = {
      has: jest.fn().mockResolvedValue(false),
      get: jest.fn().mockResolvedValue({} as unknown as MCPConnection),
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

  describe('discoverServerTools', () => {
    const mockTools = [
      { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Second tool', inputSchema: { type: 'object' } },
    ];

    const mockConnection = {
      isConnected: jest.fn().mockResolvedValue(true),
      fetchTools: jest.fn().mockResolvedValue(mockTools),
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
        connection: null,
        oauthRequired: false,
        oauthUrl: null,
      });

      const manager = await MCPManager.createInstance(newMCPServersConfig());
      const result = await manager.discoverServerTools({ serverName });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(false);
      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalled();
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
      });

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(true);
      expect(result.oauthUrl).toBe('https://auth.example.com/authorize');
      expect(MCPConnectionFactory.discoverTools).toHaveBeenCalledWith(
        expect.objectContaining({ serverName }),
        expect.objectContaining({ user: mockUser, useOAuth: true }),
      );
    });
  });
});
