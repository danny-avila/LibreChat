const { logger } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { getMCPSetupData, checkOAuthFlowStatus, getServerConnectionStatus } = require('./MCP');

// Mock all dependencies
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {
    generateFlowId: jest.fn(),
  },
}));

jest.mock('librechat-data-provider', () => ({
  CacheKeys: {
    FLOWS: 'flows',
  },
}));

jest.mock('./Config', () => ({
  loadCustomConfig: jest.fn(),
  getAppConfig: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
}));

describe('tests for the new helper functions used by the MCP connection status endpoints', () => {
  let mockLoadCustomConfig;
  let mockGetMCPManager;
  let mockGetFlowStateManager;
  let mockGetLogStores;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLoadCustomConfig = require('./Config').loadCustomConfig;
    mockGetMCPManager = require('~/config').getMCPManager;
    mockGetFlowStateManager = require('~/config').getFlowStateManager;
    mockGetLogStores = require('~/cache').getLogStores;
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
        getAllConnections: jest.fn(() => new Map()),
        getUserConnections: jest.fn(() => new Map()),
        getOAuthServers: jest.fn(() => new Set()),
      });
    });

    it('should successfully return MCP setup data', async () => {
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mockConfig.mcpServers });

      const mockAppConnections = new Map([['server1', { status: 'connected' }]]);
      const mockUserConnections = new Map([['server2', { status: 'disconnected' }]]);
      const mockOAuthServers = new Set(['server2']);

      const mockMCPManager = {
        getAllConnections: jest.fn(() => mockAppConnections),
        getUserConnections: jest.fn(() => mockUserConnections),
        getOAuthServers: jest.fn(() => mockOAuthServers),
      };
      mockGetMCPManager.mockReturnValue(mockMCPManager);

      const result = await getMCPSetupData(mockUserId);

      expect(mockGetAppConfig).toHaveBeenCalled();
      expect(mockGetMCPManager).toHaveBeenCalledWith(mockUserId);
      expect(mockMCPManager.getAllConnections).toHaveBeenCalled();
      expect(mockMCPManager.getUserConnections).toHaveBeenCalledWith(mockUserId);
      expect(mockMCPManager.getOAuthServers).toHaveBeenCalled();

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
        getAllConnections: jest.fn(() => null),
        getUserConnections: jest.fn(() => null),
        getOAuthServers: jest.fn(() => null),
      };
      mockGetMCPManager.mockReturnValue(mockMCPManager);

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
