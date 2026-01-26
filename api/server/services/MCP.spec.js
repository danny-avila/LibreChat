const { logger } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const {
  createMCPTool,
  createMCPTools,
  getMCPSetupData,
  checkOAuthFlowStatus,
  getServerConnectionStatus,
} = require('./MCP');

// Mock all dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@langchain/core/tools', () => ({
  tool: jest.fn((fn, config) => {
    const toolInstance = { _call: fn, ...config };
    return toolInstance;
  }),
}));

jest.mock('@librechat/agents', () => ({
  Providers: {
    VERTEXAI: 'vertexai',
    GOOGLE: 'google',
  },
  StepTypes: {
    TOOL_CALLS: 'tool_calls',
  },
  GraphEvents: {
    ON_RUN_STEP_DELTA: 'on_run_step_delta',
    ON_RUN_STEP: 'on_run_step',
  },
  Constants: {
    CONTENT_AND_ARTIFACT: 'content_and_artifact',
  },
}));

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {
    generateFlowId: jest.fn(),
  },
  sendEvent: jest.fn(),
  normalizeServerName: jest.fn((name) => name),
  convertWithResolvedRefs: jest.fn((params) => params),
  mcpServersRegistry: {
    getOAuthServers: jest.fn(() => Promise.resolve(new Set())),
  },
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: {
    FLOWS: 'flows',
  },
  Constants: {
    USE_PRELIM_RESPONSE_MESSAGE_ID: 'prelim_response_id',
    mcp_delimiter: '::',
    mcp_prefix: 'mcp_',
  },
  ContentTypes: {
    TEXT: 'text',
  },
  isAssistantsEndpoint: jest.fn(() => false),
  Time: {
    TWO_MINUTES: 120000,
  },
}));

jest.mock('./Config', () => ({
  loadCustomConfig: jest.fn(),
  getAppConfig: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
}));

jest.mock('./Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));

describe('tests for the new helper functions used by the MCP connection status endpoints', () => {
  let mockGetMCPManager;
  let mockGetFlowStateManager;
  let mockGetLogStores;
  let mockGetOAuthReconnectionManager;
  let mockMcpServersRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetMCPManager = require('~/config').getMCPManager;
    mockGetFlowStateManager = require('~/config').getFlowStateManager;
    mockGetLogStores = require('~/cache').getLogStores;
    mockGetOAuthReconnectionManager = require('~/config').getOAuthReconnectionManager;
    mockMcpServersRegistry = require('@librechat/api').mcpServersRegistry;
  });

  describe('getMCPSetupData', () => {
    const mockUserId = 'user-123';
    const mockConfig = {
      mcpServers: {
        server1: { type: 'stdio' },
        server2: { type: 'http' },
      },
    };
    let mockGetAppConfig;

    beforeEach(() => {
      mockGetAppConfig = require('./Config').getAppConfig;
      mockGetMCPManager.mockReturnValue({
        appConnections: { getAll: jest.fn(() => new Map()) },
        getUserConnections: jest.fn(() => new Map()),
      });
      mockMcpServersRegistry.getOAuthServers.mockResolvedValue(new Set());
    });

    it('should successfully return MCP setup data', async () => {
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mockConfig.mcpServers });

      const mockAppConnections = new Map([['server1', { status: 'connected' }]]);
      const mockUserConnections = new Map([['server2', { status: 'disconnected' }]]);
      const mockOAuthServers = new Set(['server2']);

      const mockMCPManager = {
        appConnections: { getAll: jest.fn(() => mockAppConnections) },
        getUserConnections: jest.fn(() => mockUserConnections),
      };
      mockGetMCPManager.mockReturnValue(mockMCPManager);
      mockMcpServersRegistry.getOAuthServers.mockResolvedValue(mockOAuthServers);

      const result = await getMCPSetupData(mockUserId);

      expect(mockGetAppConfig).toHaveBeenCalled();
      expect(mockGetMCPManager).toHaveBeenCalledWith(mockUserId);
      expect(mockMCPManager.appConnections.getAll).toHaveBeenCalled();
      expect(mockMCPManager.getUserConnections).toHaveBeenCalledWith(mockUserId);
      expect(mockMcpServersRegistry.getOAuthServers).toHaveBeenCalled();

      expect(result).toEqual({
        mcpConfig: mockConfig.mcpServers,
        appConnections: mockAppConnections,
        userConnections: mockUserConnections,
        oauthServers: mockOAuthServers,
      });
    });

    it('should throw error when MCP config not found', async () => {
      mockGetAppConfig.mockResolvedValue({});
      await expect(getMCPSetupData(mockUserId)).rejects.toThrow('MCP config not found');
    });

    it('should handle null values from MCP manager gracefully', async () => {
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mockConfig.mcpServers });

      const mockMCPManager = {
        appConnections: { getAll: jest.fn(() => null) },
        getUserConnections: jest.fn(() => null),
      };
      mockGetMCPManager.mockReturnValue(mockMCPManager);
      mockMcpServersRegistry.getOAuthServers.mockResolvedValue(new Set());

      const result = await getMCPSetupData(mockUserId);

      expect(result).toEqual({
        mcpConfig: mockConfig.mcpServers,
        appConnections: new Map(),
        userConnections: new Map(),
        oauthServers: new Set(),
      });
    });
  });

  describe('checkOAuthFlowStatus', () => {
    const mockUserId = 'user-123';
    const mockServerName = 'test-server';
    const mockFlowId = 'flow-123';

    beforeEach(() => {
      const mockFlowsCache = {};
      const mockFlowManager = {
        getFlowState: jest.fn(),
      };

      mockGetLogStores.mockReturnValue(mockFlowsCache);
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      MCPOAuthHandler.generateFlowId.mockReturnValue(mockFlowId);
    });

    it('should return false flags when no flow state exists', async () => {
      const mockFlowManager = { getFlowState: jest.fn(() => null) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(mockGetLogStores).toHaveBeenCalledWith(CacheKeys.FLOWS);
      expect(MCPOAuthHandler.generateFlowId).toHaveBeenCalledWith(mockUserId, mockServerName);
      expect(mockFlowManager.getFlowState).toHaveBeenCalledWith(mockFlowId, 'mcp_oauth');
      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: false });
    });

    it('should detect failed flow when status is FAILED', async () => {
      const mockFlowState = {
        status: 'FAILED',
        createdAt: Date.now() - 60000, // 1 minute ago
        ttl: 180000,
      };
      const mockFlowManager = { getFlowState: jest.fn(() => mockFlowState) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: true });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Found failed OAuth flow'),
        expect.objectContaining({
          flowId: mockFlowId,
          status: 'FAILED',
        }),
      );
    });

    it('should detect failed flow when flow has timed out', async () => {
      const mockFlowState = {
        status: 'PENDING',
        createdAt: Date.now() - 200000, // 200 seconds ago (> 180s TTL)
        ttl: 180000,
      };
      const mockFlowManager = { getFlowState: jest.fn(() => mockFlowState) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: true });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Found failed OAuth flow'),
        expect.objectContaining({
          timedOut: true,
        }),
      );
    });

    it('should detect failed flow when TTL not specified and flow exceeds default TTL', async () => {
      const mockFlowState = {
        status: 'PENDING',
        createdAt: Date.now() - 200000, // 200 seconds ago (> 180s default TTL)
        // ttl not specified, should use 180000 default
      };
      const mockFlowManager = { getFlowState: jest.fn(() => mockFlowState) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: true });
    });

    it('should detect active flow when status is PENDING and within TTL', async () => {
      const mockFlowState = {
        status: 'PENDING',
        createdAt: Date.now() - 60000, // 1 minute ago (< 180s TTL)
        ttl: 180000,
      };
      const mockFlowManager = { getFlowState: jest.fn(() => mockFlowState) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: true, hasFailedFlow: false });
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Found active OAuth flow'),
        expect.objectContaining({
          flowId: mockFlowId,
        }),
      );
    });

    it('should return false flags for other statuses', async () => {
      const mockFlowState = {
        status: 'COMPLETED',
        createdAt: Date.now() - 60000,
        ttl: 180000,
      };
      const mockFlowManager = { getFlowState: jest.fn(() => mockFlowState) };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: false });
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('Flow state error');
      const mockFlowManager = {
        getFlowState: jest.fn(() => {
          throw mockError;
        }),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);

      const result = await checkOAuthFlowStatus(mockUserId, mockServerName);

      expect(result).toEqual({ hasActiveFlow: false, hasFailedFlow: false });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking OAuth flows'),
        mockError,
      );
    });
  });

  describe('getServerConnectionStatus', () => {
    const mockUserId = 'user-123';
    const mockServerName = 'test-server';

    it('should return app connection state when available', async () => {
      const appConnections = new Map([[mockServerName, { connectionState: 'connected' }]]);
      const userConnections = new Map();
      const oauthServers = new Set();

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: false,
        connectionState: 'connected',
      });
    });

    it('should fallback to user connection state when app connection not available', async () => {
      const appConnections = new Map();
      const userConnections = new Map([[mockServerName, { connectionState: 'connecting' }]]);
      const oauthServers = new Set();

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: false,
        connectionState: 'connecting',
      });
    });

    it('should default to disconnected when no connections exist', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set();

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: false,
        connectionState: 'disconnected',
      });
    });

    it('should prioritize app connection over user connection', async () => {
      const appConnections = new Map([[mockServerName, { connectionState: 'connected' }]]);
      const userConnections = new Map([[mockServerName, { connectionState: 'disconnected' }]]);
      const oauthServers = new Set();

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: false,
        connectionState: 'connected',
      });
    });

    it('should indicate OAuth requirement when server is in OAuth servers set', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      // Mock OAuthReconnectionManager
      const mockOAuthReconnectionManager = {
        isReconnecting: jest.fn(() => false),
      };
      mockGetOAuthReconnectionManager.mockReturnValue(mockOAuthReconnectionManager);

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result.requiresOAuth).toBe(true);
    });

    it('should handle OAuth flow status when disconnected and requires OAuth with failed flow', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      // Mock OAuthReconnectionManager
      const mockOAuthReconnectionManager = {
        isReconnecting: jest.fn(() => false),
      };
      mockGetOAuthReconnectionManager.mockReturnValue(mockOAuthReconnectionManager);

      // Mock flow state to return failed flow
      const mockFlowManager = {
        getFlowState: jest.fn(() => ({
          status: 'FAILED',
          createdAt: Date.now() - 60000,
          ttl: 180000,
        })),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      mockGetLogStores.mockReturnValue({});
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-flow-id');

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: true,
        connectionState: 'error',
      });
    });

    it('should handle OAuth flow status when disconnected and requires OAuth with active flow', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      // Mock OAuthReconnectionManager
      const mockOAuthReconnectionManager = {
        isReconnecting: jest.fn(() => false),
      };
      mockGetOAuthReconnectionManager.mockReturnValue(mockOAuthReconnectionManager);

      // Mock flow state to return active flow
      const mockFlowManager = {
        getFlowState: jest.fn(() => ({
          status: 'PENDING',
          createdAt: Date.now() - 60000, // 1 minute ago
          ttl: 180000, // 3 minutes TTL
        })),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      mockGetLogStores.mockReturnValue({});
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-flow-id');

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: true,
        connectionState: 'connecting',
      });
    });

    it('should handle OAuth flow status when disconnected and requires OAuth with no flow', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      // Mock OAuthReconnectionManager
      const mockOAuthReconnectionManager = {
        isReconnecting: jest.fn(() => false),
      };
      mockGetOAuthReconnectionManager.mockReturnValue(mockOAuthReconnectionManager);

      // Mock flow state to return no flow
      const mockFlowManager = {
        getFlowState: jest.fn(() => null),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      mockGetLogStores.mockReturnValue({});
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-flow-id');

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: true,
        connectionState: 'disconnected',
      });
    });

    it('should return connecting state when OAuth server is reconnecting', async () => {
      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      // Mock OAuthReconnectionManager to return true for isReconnecting
      const mockOAuthReconnectionManager = {
        isReconnecting: jest.fn(() => true),
      };
      mockGetOAuthReconnectionManager.mockReturnValue(mockOAuthReconnectionManager);

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: true,
        connectionState: 'connecting',
      });
      expect(mockOAuthReconnectionManager.isReconnecting).toHaveBeenCalledWith(
        mockUserId,
        mockServerName,
      );
    });

    it('should not check OAuth flow status when server is connected', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn(),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      mockGetLogStores.mockReturnValue({});

      const appConnections = new Map([[mockServerName, { connectionState: 'connected' }]]);
      const userConnections = new Map();
      const oauthServers = new Set([mockServerName]);

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: true,
        connectionState: 'connected',
      });

      // Should not call flow manager since server is connected
      expect(mockFlowManager.getFlowState).not.toHaveBeenCalled();
    });

    it('should not check OAuth flow status when server does not require OAuth', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn(),
      };
      mockGetFlowStateManager.mockReturnValue(mockFlowManager);
      mockGetLogStores.mockReturnValue({});

      const appConnections = new Map();
      const userConnections = new Map();
      const oauthServers = new Set(); // Server not in OAuth servers

      const result = await getServerConnectionStatus(
        mockUserId,
        mockServerName,
        appConnections,
        userConnections,
        oauthServers,
      );

      expect(result).toEqual({
        requiresOAuth: false,
        connectionState: 'disconnected',
      });

      // Should not call flow manager since server doesn't require OAuth
      expect(mockFlowManager.getFlowState).not.toHaveBeenCalled();
    });
  });
});

describe('User parameter passing tests', () => {
  let mockReinitMCPServer;
  let mockGetFlowStateManager;
  let mockGetLogStores;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReinitMCPServer = require('./Tools/mcp').reinitMCPServer;
    mockGetFlowStateManager = require('~/config').getFlowStateManager;
    mockGetLogStores = require('~/cache').getLogStores;

    // Setup default mocks
    mockGetLogStores.mockReturnValue({});
    mockGetFlowStateManager.mockReturnValue({
      createFlowWithHandler: jest.fn(),
      failFlow: jest.fn(),
    });
  });

  describe('createMCPTools', () => {
    it('should pass user parameter to reinitMCPServer when calling reconnectServer internally', async () => {
      const mockUser = { id: 'test-user-123', name: 'Test User' };
      const mockRes = { write: jest.fn(), flush: jest.fn() };
      const mockSignal = new AbortController().signal;

      mockReinitMCPServer.mockResolvedValue({
        tools: [{ name: 'test-tool' }],
        availableTools: {
          'test-tool::test-server': {
            function: {
              description: 'Test tool',
              parameters: { type: 'object', properties: {} },
            },
          },
        },
      });

      await createMCPTools({
        res: mockRes,
        user: mockUser,
        serverName: 'test-server',
        provider: 'openai',
        signal: mockSignal,
        userMCPAuthMap: {},
      });

      // Verify reinitMCPServer was called with the user
      expect(mockReinitMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUser,
          serverName: 'test-server',
        }),
      );
      expect(mockReinitMCPServer.mock.calls[0][0].user).toBe(mockUser);
    });

    it('should throw error if user is not provided', async () => {
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      mockReinitMCPServer.mockResolvedValue({
        tools: [],
        availableTools: {},
      });

      // Call without user should throw error
      await expect(
        createMCPTools({
          res: mockRes,
          user: undefined,
          serverName: 'test-server',
          provider: 'openai',
          userMCPAuthMap: {},
        }),
      ).rejects.toThrow("Cannot read properties of undefined (reading 'id')");

      // Verify reinitMCPServer was not called due to early error
      expect(mockReinitMCPServer).not.toHaveBeenCalled();
    });
  });

  describe('createMCPTool', () => {
    it('should pass user parameter to reinitMCPServer when tool not in cache', async () => {
      const mockUser = { id: 'test-user-456', email: 'test@example.com' };
      const mockRes = { write: jest.fn(), flush: jest.fn() };
      const mockSignal = new AbortController().signal;

      mockReinitMCPServer.mockResolvedValue({
        availableTools: {
          'test-tool::test-server': {
            function: {
              description: 'Test tool',
              parameters: { type: 'object', properties: {} },
            },
          },
        },
      });

      // Call without availableTools to trigger reinit
      await createMCPTool({
        res: mockRes,
        user: mockUser,
        toolKey: 'test-tool::test-server',
        provider: 'openai',
        signal: mockSignal,
        userMCPAuthMap: {},
        availableTools: undefined, // Force reinit
      });

      // Verify reinitMCPServer was called with the user
      expect(mockReinitMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUser,
          serverName: 'test-server',
        }),
      );
      expect(mockReinitMCPServer.mock.calls[0][0].user).toBe(mockUser);
    });

    it('should not call reinitMCPServer when tool is in cache', async () => {
      const mockUser = { id: 'test-user-789' };
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      const availableTools = {
        'test-tool::test-server': {
          function: {
            description: 'Cached tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      };

      await createMCPTool({
        res: mockRes,
        user: mockUser,
        toolKey: 'test-tool::test-server',
        provider: 'openai',
        userMCPAuthMap: {},
        availableTools: availableTools,
      });

      // Verify reinitMCPServer was NOT called since tool was in cache
      expect(mockReinitMCPServer).not.toHaveBeenCalled();
    });
  });

  describe('reinitMCPServer (via reconnectServer)', () => {
    it('should always receive user parameter when called from createMCPTools', async () => {
      const mockUser = { id: 'user-001', role: 'admin' };
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      // Track all calls to reinitMCPServer
      const reinitCalls = [];
      mockReinitMCPServer.mockImplementation((params) => {
        reinitCalls.push(params);
        return Promise.resolve({
          tools: [{ name: 'tool1' }, { name: 'tool2' }],
          availableTools: {
            'tool1::server1': { function: { description: 'Tool 1', parameters: {} } },
            'tool2::server1': { function: { description: 'Tool 2', parameters: {} } },
          },
        });
      });

      await createMCPTools({
        res: mockRes,
        user: mockUser,
        serverName: 'server1',
        provider: 'anthropic',
        userMCPAuthMap: {},
      });

      // Verify all calls to reinitMCPServer had the user
      expect(reinitCalls.length).toBeGreaterThan(0);
      reinitCalls.forEach((call) => {
        expect(call.user).toBe(mockUser);
        expect(call.user.id).toBe('user-001');
      });
    });

    it('should always receive user parameter when called from createMCPTool', async () => {
      const mockUser = { id: 'user-002', permissions: ['read', 'write'] };
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      // Track all calls to reinitMCPServer
      const reinitCalls = [];
      mockReinitMCPServer.mockImplementation((params) => {
        reinitCalls.push(params);
        return Promise.resolve({
          availableTools: {
            'my-tool::my-server': {
              function: { description: 'My Tool', parameters: {} },
            },
          },
        });
      });

      await createMCPTool({
        res: mockRes,
        user: mockUser,
        toolKey: 'my-tool::my-server',
        provider: 'google',
        userMCPAuthMap: {},
        availableTools: undefined, // Force reinit
      });

      // Verify the call to reinitMCPServer had the user
      expect(reinitCalls.length).toBe(1);
      expect(reinitCalls[0].user).toBe(mockUser);
      expect(reinitCalls[0].user.id).toBe('user-002');
    });
  });

  describe('User parameter integrity', () => {
    it('should preserve user object properties through the call chain', async () => {
      const complexUser = {
        id: 'complex-user',
        name: 'John Doe',
        email: 'john@example.com',
        metadata: { subscription: 'premium', settings: { theme: 'dark' } },
      };
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      let capturedUser = null;
      mockReinitMCPServer.mockImplementation((params) => {
        capturedUser = params.user;
        return Promise.resolve({
          tools: [{ name: 'test' }],
          availableTools: {
            'test::server': { function: { description: 'Test', parameters: {} } },
          },
        });
      });

      await createMCPTools({
        res: mockRes,
        user: complexUser,
        serverName: 'server',
        provider: 'openai',
        userMCPAuthMap: {},
      });

      // Verify the complete user object was passed
      expect(capturedUser).toEqual(complexUser);
      expect(capturedUser.id).toBe('complex-user');
      expect(capturedUser.metadata.subscription).toBe('premium');
      expect(capturedUser.metadata.settings.theme).toBe('dark');
    });

    it('should throw error when user is null', async () => {
      const mockRes = { write: jest.fn(), flush: jest.fn() };

      mockReinitMCPServer.mockResolvedValue({
        tools: [],
        availableTools: {},
      });

      await expect(
        createMCPTools({
          res: mockRes,
          user: null,
          serverName: 'test-server',
          provider: 'openai',
          userMCPAuthMap: {},
        }),
      ).rejects.toThrow("Cannot read properties of null (reading 'id')");

      // Verify reinitMCPServer was not called due to early error
      expect(mockReinitMCPServer).not.toHaveBeenCalled();
    });
  });
});
