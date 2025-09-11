import { logger } from '@librechat/data-schemas';
import type { TokenMethods } from '@librechat/data-schemas';
import type { TUser } from 'librechat-data-provider';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type * as t from '~/mcp/types';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPConnection } from '~/mcp/connection';
import { MCPOAuthHandler } from '~/mcp/oauth';
import { processMCPEnv } from '~/utils';

jest.mock('~/mcp/connection');
jest.mock('~/mcp/oauth');
jest.mock('~/utils');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockProcessMCPEnv = processMCPEnv as jest.MockedFunction<typeof processMCPEnv>;
const mockMCPConnection = MCPConnection as jest.MockedClass<typeof MCPConnection>;
const mockMCPOAuthHandler = MCPOAuthHandler as jest.Mocked<typeof MCPOAuthHandler>;

describe('MCPConnectionFactory', () => {
  let mockUser: TUser;
  let mockServerConfig: t.MCPOptions;
  let mockFlowManager: jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;
  let mockConnectionInstance: jest.Mocked<MCPConnection>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      id: 'user123',
      email: 'test@example.com',
    } as TUser;

    mockServerConfig = {
      command: 'node',
      args: ['server.js'],
      initTimeout: 5000,
    } as t.MCPOptions;

    mockFlowManager = {
      createFlow: jest.fn(),
      createFlowWithHandler: jest.fn(),
      getFlowState: jest.fn(),
    } as unknown as jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;

    mockConnectionInstance = {
      connect: jest.fn(),
      isConnected: jest.fn(),
      setOAuthTokens: jest.fn(),
      on: jest.fn().mockReturnValue(mockConnectionInstance),
      emit: jest.fn(),
    } as unknown as jest.Mocked<MCPConnection>;

    mockMCPConnection.mockImplementation(() => mockConnectionInstance);
    mockProcessMCPEnv.mockReturnValue(mockServerConfig);
  });

  describe('static create method', () => {
    it('should create a basic connection without OAuth', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(basicOptions);

      expect(connection).toBe(mockConnectionInstance);
      expect(mockProcessMCPEnv).toHaveBeenCalledWith({ options: mockServerConfig });
      expect(mockMCPConnection).toHaveBeenCalledWith({
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        userId: undefined,
        oauthTokens: null,
      });
      expect(mockConnectionInstance.connect).toHaveBeenCalled();
    });

    it('should create a connection with OAuth', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const mockTokens: MCPOAuthTokens = {
        access_token: 'access123',
        refresh_token: 'refresh123',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockFlowManager.createFlowWithHandler.mockResolvedValue(mockTokens);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(basicOptions, oauthOptions);

      expect(connection).toBe(mockConnectionInstance);
      expect(mockProcessMCPEnv).toHaveBeenCalledWith({ options: mockServerConfig, user: mockUser });
      expect(mockMCPConnection).toHaveBeenCalledWith({
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        userId: 'user123',
        oauthTokens: mockTokens,
      });
    });
  });

  describe('OAuth token handling', () => {
    it('should return null when no findToken method is provided', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      const oauthOptions: t.OAuthConnectionOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        tokenMethods: {
          findToken: undefined as unknown as TokenMethods['findToken'],
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await MCPConnectionFactory.create(basicOptions, oauthOptions);

      expect(mockFlowManager.createFlowWithHandler).not.toHaveBeenCalled();
    });

    it('should handle token retrieval errors gracefully', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('Token fetch failed'));
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(basicOptions, oauthOptions);

      expect(connection).toBe(mockConnectionInstance);
      expect(mockMCPConnection).toHaveBeenCalledWith({
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        userId: 'user123',
        oauthTokens: null,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No existing tokens found or error loading tokens'),
        expect.any(Error),
      );
    });
  });

  describe('OAuth event handling', () => {
    it('should handle oauthRequired event for returnOnOAuth scenario', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: {
          ...mockServerConfig,
          url: 'https://api.example.com',
          type: 'sse' as const,
        } as t.SSEOptions,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        returnOnOAuth: true,
        oauthStart: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const mockFlowData = {
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'random-state',
          clientInfo: { client_id: 'client123' },
        },
      };

      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.createFlow.mockRejectedValue(new Error('Timeout expected'));
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      let oauthRequiredHandler: (data: Record<string, unknown>) => Promise<void>;
      mockConnectionInstance.on.mockImplementation((event, handler) => {
        if (event === 'oauthRequired') {
          oauthRequiredHandler = handler as (data: Record<string, unknown>) => Promise<void>;
        }
        return mockConnectionInstance;
      });

      try {
        await MCPConnectionFactory.create(basicOptions, oauthOptions);
      } catch {
        // Expected to fail due to connection not established
      }

      expect(oauthRequiredHandler!).toBeDefined();

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalledWith(
        'test-server',
        'https://api.example.com',
        'user123',
        undefined,
      );
      expect(oauthOptions.oauthStart).toHaveBeenCalledWith('https://auth.example.com');
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({
          message: 'OAuth flow initiated - return early',
        }),
      );
    });
  });

  describe('connection retry logic', () => {
    it('should establish connection successfully', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig, // Use default 5000ms timeout
      };

      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(basicOptions);

      expect(connection).toBe(mockConnectionInstance);
      expect(mockConnectionInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle OAuth errors during connection attempts', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const oauthError = new Error('Non-200 status code (401)');
      (oauthError as unknown as Record<string, unknown>).isOAuthError = true;

      mockConnectionInstance.connect.mockRejectedValue(oauthError);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(MCPConnectionFactory.create(basicOptions, oauthOptions)).rejects.toThrow(
        'Non-200 status code (401)',
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth required, stopping connection attempts'),
      );
    });
  });

  describe('isOAuthError method', () => {
    it('should identify OAuth errors by message content', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const error401 = new Error('401 Unauthorized');

      mockConnectionInstance.connect.mockRejectedValue(error401);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(MCPConnectionFactory.create(basicOptions, oauthOptions)).rejects.toThrow('401');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth required, stopping connection attempts'),
      );
    });
  });
});
