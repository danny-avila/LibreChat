import { TokenMethods } from '@librechat/data-schemas';
import { FlowStateManager, MCPConnection, MCPOAuthTokens, MCPOptions } from '../..';
import { MCPManager } from '../MCPManager';
import { OAuthReconnectionManager } from './OAuthReconnectionManager';
import { OAuthReconnectionTracker } from './OAuthReconnectionTracker';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../MCPManager');

describe('OAuthReconnectionManager', () => {
  let flowManager: jest.Mocked<FlowStateManager<null>>;
  let tokenMethods: jest.Mocked<TokenMethods>;
  let mockMCPManager: jest.Mocked<MCPManager>;
  let reconnectionManager: OAuthReconnectionManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (OAuthReconnectionManager as any).instance = null;

    // Setup mock flow manager
    flowManager = {
      createFlow: jest.fn(),
      completeFlow: jest.fn(),
      failFlow: jest.fn(),
      deleteFlow: jest.fn(),
      getFlow: jest.fn(),
    } as unknown as jest.Mocked<FlowStateManager<null>>;

    // Setup mock token methods
    tokenMethods = {
      findToken: jest.fn(),
      createToken: jest.fn(),
      updateToken: jest.fn(),
      deleteToken: jest.fn(),
    } as unknown as jest.Mocked<TokenMethods>;

    // Setup mock MCP Manager
    mockMCPManager = {
      getOAuthServers: jest.fn(),
      getUserConnection: jest.fn(),
      getUserConnections: jest.fn(),
      disconnectUserConnection: jest.fn(),
      getRawConfig: jest.fn(),
    } as unknown as jest.Mocked<MCPManager>;

    (MCPManager.getInstance as jest.Mock).mockReturnValue(mockMCPManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should create instance successfully', async () => {
      const instance = await OAuthReconnectionManager.createInstance(flowManager, tokenMethods);
      expect(instance).toBeInstanceOf(OAuthReconnectionManager);
    });

    it('should throw error when creating instance twice', async () => {
      await OAuthReconnectionManager.createInstance(flowManager, tokenMethods);
      await expect(
        OAuthReconnectionManager.createInstance(flowManager, tokenMethods),
      ).rejects.toThrow('OAuthReconnectionManager already initialized');
    });

    it('should throw error when getting instance before creation', () => {
      expect(() => OAuthReconnectionManager.getInstance()).toThrow(
        'OAuthReconnectionManager not initialized',
      );
    });
  });

  describe('isReconnecting', () => {
    let reconnectionTracker: OAuthReconnectionTracker;
    beforeEach(async () => {
      reconnectionTracker = new OAuthReconnectionTracker();
      reconnectionManager = await OAuthReconnectionManager.createInstance(
        flowManager,
        tokenMethods,
        reconnectionTracker,
      );
    });

    it('should return true when server is actively reconnecting', () => {
      const userId = 'user-123';
      const serverName = 'test-server';

      expect(reconnectionManager.isReconnecting(userId, serverName)).toBe(false);

      reconnectionTracker.setActive(userId, serverName);
      const result = reconnectionManager.isReconnecting(userId, serverName);
      expect(result).toBe(true);
    });

    it('should return false when server is not reconnecting', () => {
      const userId = 'user-123';
      const serverName = 'test-server';

      const result = reconnectionManager.isReconnecting(userId, serverName);
      expect(result).toBe(false);
    });
  });

  describe('clearReconnection', () => {
    let reconnectionTracker: OAuthReconnectionTracker;
    beforeEach(async () => {
      reconnectionTracker = new OAuthReconnectionTracker();
      reconnectionManager = await OAuthReconnectionManager.createInstance(
        flowManager,
        tokenMethods,
        reconnectionTracker,
      );
    });

    it('should clear both failed and active reconnection states', () => {
      const userId = 'user-123';
      const serverName = 'test-server';

      reconnectionTracker.setFailed(userId, serverName);
      reconnectionTracker.setActive(userId, serverName);

      reconnectionManager.clearReconnection(userId, serverName);

      expect(reconnectionManager.isReconnecting(userId, serverName)).toBe(false);
      expect(reconnectionTracker.isFailed(userId, serverName)).toBe(false);
      expect(reconnectionTracker.isActive(userId, serverName)).toBe(false);
    });
  });

  describe('reconnectServers', () => {
    let reconnectionTracker: OAuthReconnectionTracker;
    beforeEach(async () => {
      reconnectionTracker = new OAuthReconnectionTracker();
      reconnectionManager = await OAuthReconnectionManager.createInstance(
        flowManager,
        tokenMethods,
        reconnectionTracker,
      );
    });

    it('should reconnect eligible servers', async () => {
      const userId = 'user-123';
      const oauthServers = new Set(['server1', 'server2', 'server3']);
      mockMCPManager.getOAuthServers.mockReturnValue(oauthServers);

      // server1: has failed reconnection
      reconnectionTracker.setFailed(userId, 'server1');

      // server2: already connected
      const mockConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
      };
      const userConnections = new Map([['server2', mockConnection]]);
      mockMCPManager.getUserConnections.mockReturnValue(
        userConnections as unknown as Map<string, MCPConnection>,
      );

      // server3: has valid token and not connected
      tokenMethods.findToken.mockImplementation(async ({ identifier }) => {
        if (identifier === 'mcp:server3') {
          return {
            userId,
            identifier,
            expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          } as unknown as MCPOAuthTokens;
        }
        return null;
      });

      // Mock successful reconnection
      const mockNewConnection = {
        isConnected: jest.fn().mockResolvedValue(true),
        disconnect: jest.fn(),
      };
      mockMCPManager.getUserConnection.mockResolvedValue(
        mockNewConnection as unknown as MCPConnection,
      );
      mockMCPManager.getRawConfig.mockReturnValue({ initTimeout: 5000 } as unknown as MCPOptions);

      await reconnectionManager.reconnectServers(userId);

      // Verify server3 was marked as active
      expect(reconnectionTracker.isActive(userId, 'server3')).toBe(true);

      // Wait for async tryReconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify reconnection was attempted for server3
      expect(mockMCPManager.getUserConnection).toHaveBeenCalledWith({
        serverName: 'server3',
        user: { id: userId },
        flowManager,
        tokenMethods,
        forceNew: false,
        connectionTimeout: 5000,
        returnOnOAuth: true,
      });

      // Verify successful reconnection cleared the states
      expect(reconnectionTracker.isFailed(userId, 'server3')).toBe(false);
      expect(reconnectionTracker.isActive(userId, 'server3')).toBe(false);
    });

    it('should handle failed reconnection attempts', async () => {
      const userId = 'user-123';
      const oauthServers = new Set(['server1']);
      mockMCPManager.getOAuthServers.mockReturnValue(oauthServers);

      // server1: has valid token
      tokenMethods.findToken.mockResolvedValue({
        userId,
        identifier: 'mcp:server1',
        expiresAt: new Date(Date.now() + 3600000),
      } as unknown as MCPOAuthTokens);

      // Mock failed connection
      mockMCPManager.getUserConnection.mockRejectedValue(new Error('Connection failed'));
      mockMCPManager.getRawConfig.mockReturnValue({} as unknown as MCPOptions);

      await reconnectionManager.reconnectServers(userId);

      // Wait for async tryReconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify failure handling
      expect(reconnectionTracker.isFailed(userId, 'server1')).toBe(true);
      expect(reconnectionTracker.isActive(userId, 'server1')).toBe(false);
      expect(mockMCPManager.disconnectUserConnection).toHaveBeenCalledWith(userId, 'server1');
    });

    it('should not reconnect servers with expired tokens', async () => {
      const userId = 'user-123';
      const oauthServers = new Set(['server1']);
      mockMCPManager.getOAuthServers.mockReturnValue(oauthServers);

      // server1: has expired token
      tokenMethods.findToken.mockResolvedValue({
        userId,
        identifier: 'mcp:server1',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      } as unknown as MCPOAuthTokens);

      await reconnectionManager.reconnectServers(userId);

      // Verify no reconnection attempt was made
      expect(reconnectionTracker.isActive(userId, 'server1')).toBe(false);
      expect(mockMCPManager.getUserConnection).not.toHaveBeenCalled();
    });

    it('should handle connection that returns but is not connected', async () => {
      const userId = 'user-123';
      const oauthServers = new Set(['server1']);
      mockMCPManager.getOAuthServers.mockReturnValue(oauthServers);

      tokenMethods.findToken.mockResolvedValue({
        userId,
        identifier: 'mcp:server1',
        expiresAt: new Date(Date.now() + 3600000),
      } as unknown as MCPOAuthTokens);

      // Mock connection that returns but is not connected
      const mockConnection = {
        isConnected: jest.fn().mockResolvedValue(false),
        disconnect: jest.fn(),
      };
      mockMCPManager.getUserConnection.mockResolvedValue(
        mockConnection as unknown as MCPConnection,
      );
      mockMCPManager.getRawConfig.mockReturnValue({} as unknown as MCPOptions);

      await reconnectionManager.reconnectServers(userId);

      // Wait for async tryReconnect to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify failure handling
      expect(mockConnection.disconnect).toHaveBeenCalled();
      expect(reconnectionTracker.isFailed(userId, 'server1')).toBe(true);
      expect(reconnectionTracker.isActive(userId, 'server1')).toBe(false);
      expect(mockMCPManager.disconnectUserConnection).toHaveBeenCalledWith(userId, 'server1');
    });
  });
});
