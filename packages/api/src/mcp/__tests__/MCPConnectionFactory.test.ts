import { logger, getTenantId, tenantStorage } from '@librechat/data-schemas';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type * as t from '~/mcp/types';
import { MCPConnectionFactory } from '~/mcp/MCPConnectionFactory';
import { MCPOAuthHandler, MCPTokenStorage } from '~/mcp/oauth';
import { preProcessGraphTokens } from '~/utils/graph';
import { PENDING_STALE_MS } from '~/flow/manager';
import { MCPConnection } from '~/mcp/connection';
import { processMCPEnv } from '~/utils';

jest.mock('~/mcp/connection');
jest.mock('~/mcp/oauth');
jest.mock('~/utils/graph', () => ({
  ...jest.requireActual('~/utils/graph'),
  preProcessGraphTokens: jest.fn(async (options) => options),
}));
jest.mock('~/utils');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(),
  tenantStorage: {
    getStore: jest.fn(),
    run: jest.fn((_context, fn: () => Promise<unknown>) => fn()),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockTenantStorage = tenantStorage as unknown as {
  getStore: jest.Mock;
  run: jest.Mock;
};
const mockProcessMCPEnv = processMCPEnv as jest.MockedFunction<typeof processMCPEnv>;
const mockPreProcessGraphTokens = preProcessGraphTokens as jest.MockedFunction<
  typeof preProcessGraphTokens
>;
const mockMCPConnection = MCPConnection as jest.MockedClass<typeof MCPConnection>;
const mockMCPOAuthHandler = MCPOAuthHandler as jest.Mocked<typeof MCPOAuthHandler>;
const mockMCPTokenStorage = MCPTokenStorage as jest.Mocked<typeof MCPTokenStorage>;

class InspectableMCPConnectionFactory extends MCPConnectionFactory {
  public constructor(
    basic: t.BasicConnectionOptions,
    options?: t.OAuthConnectionOptions | t.UserConnectionContext,
  ) {
    super(basic, options);
  }

  public async createConnectionForTest(): Promise<MCPConnection> {
    return await this.createConnection();
  }

  public getRequestScopedOAuthState(): {
    signal?: AbortSignal;
    oauthStart?: (authURL: string) => Promise<void>;
    oauthEnd?: () => Promise<void>;
    returnOnOAuth?: boolean;
  } {
    return {
      signal: this.signal,
      oauthStart: this.oauthStart,
      oauthEnd: this.oauthEnd,
      returnOnOAuth: this.returnOnOAuth,
    };
  }
}

describe('MCPConnectionFactory', () => {
  let mockUser: IUser | undefined;
  let mockServerConfig: t.MCPOptions;
  let mockFlowManager: jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;
  let mockConnectionInstance: jest.Mocked<MCPConnection>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear process-local silent-refresh in-flight map so a leftover entry
    // from a prior test (e.g. one that errored before its `finally` ran)
    // cannot cause a later test to join a stale promise.
    (
      MCPConnectionFactory as unknown as { inflightSilentRefreshes: Map<string, unknown> }
    ).inflightSilentRefreshes.clear();
    mockUser = {
      id: 'user123',
      email: 'test@example.com',
    } as IUser;

    mockServerConfig = {
      command: 'node',
      args: ['server.js'],
      initTimeout: 5000,
    } as t.MCPOptions;

    mockFlowManager = {
      initFlow: jest.fn().mockResolvedValue(undefined),
      createFlow: jest.fn(),
      createFlowWithHandler: jest.fn(),
      getFlowState: jest.fn(),
      completeFlow: jest.fn().mockResolvedValue(true),
      deleteFlow: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<FlowStateManager<MCPOAuthTokens | null>>;

    mockConnectionInstance = {
      connect: jest.fn(),
      isConnected: jest.fn(),
      setOAuthTokens: jest.fn(),
      on: jest.fn().mockReturnValue(mockConnectionInstance),
      once: jest.fn().mockReturnValue(mockConnectionInstance),
      off: jest.fn().mockReturnValue(mockConnectionInstance),
      removeListener: jest.fn().mockReturnValue(mockConnectionInstance),
      emit: jest.fn(),
    } as unknown as jest.Mocked<MCPConnection>;

    mockMCPConnection.mockImplementation(() => mockConnectionInstance);
    mockPreProcessGraphTokens.mockImplementation(async (options) => options);
    mockProcessMCPEnv.mockReturnValue(mockServerConfig);
    mockMCPOAuthHandler.generateFlowId.mockImplementation(
      (userId: string, serverName: string, tenantId?: string) => {
        const flowId = `${userId}:${serverName}`;
        return tenantId ? `tenant:${encodeURIComponent(tenantId)}:${flowId}` : flowId;
      },
    );
    mockMCPOAuthHandler.generateTokenFlowId.mockImplementation(
      (userId: string, serverName: string, tenantId?: string) => {
        const flowId = mockMCPOAuthHandler.generateFlowId(userId, serverName);
        return tenantId ? `tenant:${encodeURIComponent(tenantId)}:${flowId}` : flowId;
      },
    );
    mockMCPOAuthHandler.buildStoredClientMetadata.mockImplementation(
      (metadata, resourceMetadata) =>
        metadata
          ? {
              ...metadata,
              ...(resourceMetadata?.resource && { resource: resourceMetadata.resource }),
            }
          : undefined,
    );
    mockTenantStorage.getStore.mockReturnValue(undefined);
    mockTenantStorage.run.mockImplementation((_context, fn: () => Promise<unknown>) => fn());
    (getTenantId as jest.Mock).mockReturnValue(undefined);
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
      expect(mockProcessMCPEnv).toHaveBeenCalledWith({
        options: mockServerConfig,
        dbSourced: undefined,
      });
      expect(mockMCPConnection).toHaveBeenCalledWith({
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        userId: undefined,
        oauthTokens: null,
        useSSRFProtection: false,
        allowedAddresses: undefined,
        ephemeralConnection: false,
      });
      expect(mockConnectionInstance.connect).toHaveBeenCalled();
    });

    it('should pre-process Graph placeholders before connection config resolution', async () => {
      const graphTokenResolver = jest.fn();
      const serverConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://api.example.com/mcp?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
      };
      const graphProcessedConfig: t.MCPOptions = {
        ...serverConfig,
        url: 'https://api.example.com/mcp?token=resolved-graph-token',
      };
      const basicOptions = {
        serverName: 'test-server',
        serverConfig,
      };

      mockPreProcessGraphTokens.mockResolvedValue(graphProcessedConfig);
      mockProcessMCPEnv.mockReturnValue(graphProcessedConfig);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await MCPConnectionFactory.create(basicOptions, {
        user: mockUser,
        graphTokenResolver,
      });

      expect(mockPreProcessGraphTokens).toHaveBeenCalledWith(
        serverConfig,
        expect.objectContaining({
          user: mockUser,
          graphTokenResolver,
        }),
      );
      expect(mockProcessMCPEnv).toHaveBeenCalledWith(
        expect.objectContaining({
          options: graphProcessedConfig,
        }),
      );
      expect(mockMCPConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          serverConfig: graphProcessedConfig,
        }),
      );
    });

    it('should register fallback oauthRequired handler for non-OAuth connections', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await MCPConnectionFactory.create(basicOptions);

      expect(mockConnectionInstance.on).toHaveBeenCalledWith('oauthRequired', expect.any(Function));

      const onCall = (mockConnectionInstance.on as jest.Mock).mock.calls.find(
        ([event]: [string]) => event === 'oauthRequired',
      );
      const handler = onCall![1] as () => void;
      handler();

      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({ message: 'Server does not use OAuth' }),
      );
      // The fallback `oauthRequired` listener is intentionally kept attached
      // for the connection's lifetime so mid-session 401s are still handled.
      expect(mockConnectionInstance.removeListener).not.toHaveBeenCalledWith(
        'oauthRequired',
        expect.any(Function),
      );
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
      expect(mockProcessMCPEnv).toHaveBeenCalledWith({
        options: mockServerConfig,
        user: mockUser,
        dbSourced: undefined,
      });
      expect(mockMCPConnection).toHaveBeenCalledWith({
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        userId: 'user123',
        oauthTokens: mockTokens,
        useSSRFProtection: false,
        allowedAddresses: undefined,
        ephemeralConnection: false,
      });
    });

    it('should tenant-scope mcp_get_tokens flow locks', async () => {
      mockTenantStorage.getStore.mockReturnValueOnce({ tenantId: 'tenant-a' });
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');

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

      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await MCPConnectionFactory.create(basicOptions, oauthOptions);

      expect(mockFlowManager.createFlowWithHandler).toHaveBeenCalledWith(
        'tenant:tenant-a:flow123',
        'mcp_get_tokens',
        expect.any(Function),
        undefined,
      );
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
        useSSRFProtection: false,
        allowedAddresses: undefined,
        ephemeralConnection: false,
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

      (getTenantId as jest.Mock).mockReturnValue('test-tenant');

      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      // createFlow runs as a background monitor — simulate it staying pending
      mockFlowManager.createFlow.mockReturnValue(new Promise(() => {}));
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

      (getTenantId as jest.Mock).mockReturnValue(undefined);
      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalledWith(
        'test-server',
        'https://api.example.com',
        'user123',
        {},
        undefined,
        undefined,
        oauthOptions.tokenMethods.findToken,
        undefined,
        'test-tenant',
      );

      // initFlow must be awaited BEFORE the redirect to guarantee state is stored
      expect(mockFlowManager.initFlow).toHaveBeenCalledWith(
        'flow123',
        'mcp_oauth',
        expect.objectContaining({ ...mockFlowData.flowMetadata, tenantId: 'test-tenant' }),
      );
      const initCallOrder = mockFlowManager.initFlow.mock.invocationCallOrder[0];
      const oauthStartCallOrder = (oauthOptions.oauthStart as jest.Mock).mock
        .invocationCallOrder[0];
      expect(initCallOrder).toBeLessThan(oauthStartCallOrder);

      expect(oauthOptions.oauthStart).toHaveBeenCalledWith('https://auth.example.com');
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({
          message: 'OAuth flow initiated - return early',
        }),
      );
    });

    it('should clear stale client registration when returnOnOAuth flow fails with client rejection', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: {
          ...mockServerConfig,
          url: 'https://api.example.com',
          type: 'sse' as const,
        } as t.SSEOptions,
      };

      const deleteTokensSpy = jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 });
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
          deleteTokens: deleteTokensSpy,
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
          clientInfo: { client_id: 'stale-client' },
          reusedStoredClient: true,
        },
      };

      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockMCPTokenStorage.deleteClientRegistration.mockResolvedValue(undefined);
      // createFlow rejects with invalid_client — simulating stale client rejection
      mockFlowManager.createFlow.mockRejectedValue(new Error('invalid_client'));
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // Drain microtasks so the background .catch() handler completes
      await new Promise((r) => setImmediate(r));

      // deleteClientRegistration should have been called via clearStaleClientIfRejected
      expect(mockMCPTokenStorage.deleteClientRegistration).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          serverName: 'test-server',
        }),
      );
    });

    it('should re-issue the stored OAuth URL when a PENDING flow already exists (returnOnOAuth)', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        user: mockUser,
      };

      const oauthOptions: t.OAuthConnectionOptions = {
        user: mockUser,
        useOAuth: true,
        returnOnOAuth: true,
        oauthStart: jest.fn(),
        flowManager: mockFlowManager,
      };

      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        type: 'mcp_oauth',
        metadata: {
          codeVerifier: 'existing-verifier',
          authorizationUrl: 'https://auth.example.com/existing',
        },
        createdAt: Date.now(),
      });
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(oauthOptions.oauthStart).toHaveBeenCalledWith(
        'https://auth.example.com/existing',
        expect.objectContaining({ expiresAt: expect.any(Number) }),
      );
      expect(mockFlowManager.deleteFlow).not.toHaveBeenCalled();
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({ message: 'Pending OAuth flow reused - return early' }),
      );
    });

    it('should emit oauthFailed when a PENDING flow expires before replay (returnOnOAuth)', async () => {
      const createdAt = 1000;
      const firstNow = createdAt + PENDING_STALE_MS - 1;
      const expiredNow = createdAt + PENDING_STALE_MS;
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(firstNow)
        .mockReturnValueOnce(expiredNow)
        .mockReturnValue(expiredNow);

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        user: mockUser,
      };

      const oauthOptions: t.OAuthConnectionOptions = {
        user: mockUser,
        useOAuth: true,
        returnOnOAuth: true,
        oauthStart: jest.fn(),
        flowManager: mockFlowManager,
      };

      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING',
        type: 'mcp_oauth',
        metadata: {
          codeVerifier: 'existing-verifier',
          authorizationUrl: 'https://auth.example.com/existing',
        },
        createdAt,
      });
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(oauthOptions.oauthStart).not.toHaveBeenCalled();
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({ message: 'Pending OAuth flow expired before replay' }),
      );
    });

    it('should emit oauthFailed when initFlow fails to store flow state (returnOnOAuth)', async () => {
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
          state: 'state123',
        },
      };

      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.initFlow.mockRejectedValue(new Error('Store write failed'));
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // initFlow failed, so oauthStart should NOT have been called (redirect never happens)
      expect(oauthOptions.oauthStart).not.toHaveBeenCalled();
      // createFlow should NOT have been called since initFlow failed first
      expect(mockFlowManager.createFlow).not.toHaveBeenCalled();
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({ message: 'OAuth initiation failed' }),
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log warnings when background createFlow monitor rejects (returnOnOAuth)', async () => {
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
          state: 'state123',
        },
      };

      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      // Simulate the background monitor timing out
      mockFlowManager.createFlow.mockRejectedValue(new Error('mcp_oauth flow timed out'));
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // Allow the .catch handler on createFlow to execute
      await Promise.resolve();

      // initFlow should have succeeded and redirect should have happened
      expect(mockFlowManager.initFlow).toHaveBeenCalled();
      expect(oauthOptions.oauthStart).toHaveBeenCalledWith('https://auth.example.com');
      // The background monitor error should be logged, not silently swallowed
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('OAuth flow monitor ended'),
        expect.any(Error),
      );
    });

    it('should call initFlow before createFlow in blocking OAuth path (non-returnOnOAuth)', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
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
          metadata: {
            token_endpoint: 'https://auth.example.com/token',
            authorization_endpoint: 'https://auth.example.com/authorize',
          },
        },
      };

      const mockTokens: MCPOAuthTokens = {
        access_token: 'access123',
        refresh_token: 'refresh123',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      // processMCPEnv must return config with url so handleOAuthRequired proceeds
      mockProcessMCPEnv.mockReturnValue(sseConfig);
      (getTenantId as jest.Mock).mockReturnValue('test-tenant');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(mockTokens);
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
        // Expected to fail
      }

      (getTenantId as jest.Mock).mockReturnValue(undefined);
      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // initFlow must be called BEFORE oauthStart and createFlow
      expect(mockFlowManager.initFlow).toHaveBeenCalledWith(
        'flow123',
        'mcp_oauth',
        expect.objectContaining({ ...mockFlowData.flowMetadata, tenantId: 'test-tenant' }),
      );
      const initCallOrder = mockFlowManager.initFlow.mock.invocationCallOrder[0];
      const oauthStartCallOrder = (oauthOptions.oauthStart as jest.Mock).mock
        .invocationCallOrder[0];
      const createCallOrder = mockFlowManager.createFlow.mock.invocationCallOrder[0];
      expect(initCallOrder).toBeLessThan(oauthStartCallOrder);
      expect(initCallOrder).toBeLessThan(createCallOrder);

      // createFlow should receive {} since initFlow already persisted metadata
      expect(mockFlowManager.createFlow).toHaveBeenCalledWith(
        'flow123',
        'mcp_oauth',
        {},
        undefined,
      );
    });

    it('should delete stale flow and create new OAuth flow when existing flow is COMPLETED', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
        user: mockUser,
      };

      const oauthOptions: t.OAuthConnectionOptions = {
        user: mockUser,
        useOAuth: true,
        returnOnOAuth: true,
        oauthStart: jest.fn(),
        flowManager: mockFlowManager,
      };

      const mockFlowData = {
        authorizationUrl: 'https://auth.example.com',
        flowId: 'user123:test-server',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'test-state',
          codeVerifier: 'new-code-verifier-xyz',
          clientInfo: { client_id: 'test-client' },
          metadata: {
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            issuer: 'https://api.example.com',
          },
        },
      };

      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'COMPLETED',
        type: 'mcp_oauth',
        metadata: { codeVerifier: 'old-verifier' },
        createdAt: Date.now() - 60000,
      });
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.deleteFlow.mockResolvedValue(true);
      // createFlow runs as a background monitor — simulate it staying pending
      mockFlowManager.createFlow.mockReturnValue(new Promise(() => {}));
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith('user123:test-server', 'mcp_oauth');

      // initFlow must be called after deleteFlow and before createFlow
      const deleteCallOrder = mockFlowManager.deleteFlow.mock.invocationCallOrder[0];
      const initCallOrder = mockFlowManager.initFlow.mock.invocationCallOrder[0];
      const createCallOrder = mockFlowManager.createFlow.mock.invocationCallOrder[0];
      expect(deleteCallOrder).toBeLessThan(initCallOrder);
      expect(initCallOrder).toBeLessThan(createCallOrder);

      expect(mockFlowManager.initFlow).toHaveBeenCalledWith(
        'user123:test-server',
        'mcp_oauth',
        expect.objectContaining({
          codeVerifier: 'new-code-verifier-xyz',
        }),
      );

      // createFlow finds the existing PENDING state written by initFlow,
      // so metadata arg is unused (passed as {})
      expect(mockFlowManager.createFlow).toHaveBeenCalledWith(
        'user123:test-server',
        'mcp_oauth',
        {},
        undefined,
      );
    });

    it('should silently refresh tokens on oauthRequired without invoking interactive flow', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'refreshed-access',
        refresh_token: 'refresh123',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      // The silent refresh path: createFlowWithHandler executes the handler
      // (which calls forceRefreshTokens) and returns the refreshed tokens.
      mockFlowManager.createFlowWithHandler.mockImplementation(async (_flowId, type, handler) => {
        if (type === 'mcp_get_tokens') {
          return handler();
        }
        return null;
      });
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(refreshedTokens);
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
        // Expected to fail because connection itself is mocked as not connected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          serverName: 'test-server',
          findToken: oauthOptions.tokenMethods.findToken,
          createToken: oauthOptions.tokenMethods.createToken,
        }),
      );
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(refreshedTokens);
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith('oauthHandled');
      // Silent refresh succeeded — interactive flow must NOT be initiated.
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
    });

    it('should fall back to interactive OAuth when silent refresh returns null', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
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
        },
      };

      const interactiveTokens: MCPOAuthTokens = {
        access_token: 'interactive-access',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      // Silent refresh attempt returns null (no refresh token / refresh failed).
      mockFlowManager.createFlowWithHandler.mockImplementation(async (_flowId, type, handler) => {
        if (type === 'mcp_get_tokens') {
          return handler();
        }
        return null;
      });
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(interactiveTokens);
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
        // Expected to fail
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // Silent refresh was attempted, but yielded no tokens.
      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalled();
      // Fall-through behavior: interactive flow runs.
      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(interactiveTokens);
    });

    it('should silently refresh tokens for returnOnOAuth path without redirecting', async () => {
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

      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'refreshed-access',
        refresh_token: 'refresh123',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockFlowManager.createFlowWithHandler.mockImplementation(async (_flowId, type, handler) => {
        if (type === 'mcp_get_tokens') {
          return handler();
        }
        return null;
      });
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(refreshedTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(refreshedTokens);
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith('oauthHandled');
      // returnOnOAuth interactive path must NOT trigger when silent refresh succeeds.
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(oauthOptions.oauthStart).not.toHaveBeenCalled();
    });

    it('should fall back to interactive OAuth when silent refresh throws unexpectedly', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
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
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      // Silent refresh path throws — must be swallowed and interactive runs.
      mockMCPTokenStorage.forceRefreshTokens.mockRejectedValueOnce(new Error('refresh boom'));
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue({
        access_token: 'fallback-access',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      } as MCPOAuthTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // The thrown silent refresh error must be swallowed and the interactive
      // flow used as a fallback so the user is never stuck.
      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
    });

    it('should bypass any flow cache on silent refresh and invalidate mcp_get_tokens cache (regression for stale cached token reuse)', async () => {
      // Reproduces the cache-collision flagged by Codex on PR #13369: when an
      // earlier `getOAuthTokens` call cached its (now server-rejected) tokens
      // under the `mcp_get_tokens` flow, the silent refresh must NOT share or
      // reuse that cache. The fix bypasses `FlowStateManager` entirely for the
      // force-refresh, calls `MCPTokenStorage.forceRefreshTokens` directly,
      // and invalidates the `mcp_get_tokens` cache afterwards so the next
      // `getOAuthTokens` reads the freshly persisted tokens.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const staleCachedTokens: MCPOAuthTokens = {
        access_token: 'stale-cached-access',
        refresh_token: 'refresh123',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      const freshlyRefreshedTokens: MCPOAuthTokens = {
        access_token: 'freshly-refreshed-access',
        refresh_token: 'refresh456',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      // Simulate the real FlowStateManager cache behavior for `mcp_get_tokens`:
      // a prior call cached `staleCachedTokens` and the cache is still
      // non-expired, so `getOAuthTokens` returns it without re-running the
      // handler. Silent refresh must NOT route through this cached flow.
      mockFlowManager.createFlowWithHandler.mockImplementation(async (_flowId, type, _handler) => {
        if (type === 'mcp_get_tokens') {
          return staleCachedTokens;
        }
        return null;
      });
      // `invalidateGetTokensFlow` only deletes COMPLETED states (to avoid
      // breaking concurrent PENDING joiners), so reflect that here.
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'COMPLETED' as const,
        type: 'mcp_get_tokens',
        metadata: {},
        createdAt: Date.now(),
        completedAt: Date.now(),
        result: staleCachedTokens,
      });
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(freshlyRefreshedTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // The refresh runs against the token storage directly — not through any
      // `createFlowWithHandler` flow that could return a stale cached value.
      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalled();
      expect(mockFlowManager.createFlowWithHandler).not.toHaveBeenCalledWith(
        expect.anything(),
        'mcp_force_refresh_tokens',
        expect.anything(),
        expect.anything(),
      );
      // The connection receives the FRESHLY refreshed tokens, NOT the stale
      // cached ones — that's the whole point of the fix.
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(freshlyRefreshedTokens);
      expect(mockConnectionInstance.setOAuthTokens).not.toHaveBeenCalledWith(staleCachedTokens);
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith('oauthHandled');
      // The cached `mcp_get_tokens` flow state is dropped so the next
      // `getOAuthTokens` call reads the freshly persisted tokens from storage.
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith('flow123', 'mcp_get_tokens');
    });

    it('should coalesce concurrent silent refresh attempts into a single redemption', async () => {
      // Reproduces the concurrent-redemption race flagged by Codex on PR #13369:
      // if two 401s for the same user/server race the silent refresh, they
      // must share one in-flight refresh-token redemption — providers that
      // rotate refresh tokens reject the second redemption, otherwise causing
      // an unnecessary interactive OAuth fallback.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'refreshed-access',
        refresh_token: 'refresh456',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      // Hold a single in-flight refresh open until both concurrent callers
      // have joined the lock. `mockImplementationOnce` (rather than the
      // persistent `mockImplementation`) ensures this never-resolving promise
      // does not leak into later tests' default mock behavior.
      let resolveRefresh: ((tokens: MCPOAuthTokens) => void) | undefined;
      mockMCPTokenStorage.forceRefreshTokens.mockImplementationOnce(
        () =>
          new Promise<MCPOAuthTokens>((res) => {
            resolveRefresh = res;
          }),
      );
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
        // Expected
      }

      // Fire two concurrent oauthRequired events; both must share the same
      // in-flight refresh attempt.
      const first = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
      const second = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // Let the in-flight lock register, then resolve the single redemption.
      await Promise.resolve();
      resolveRefresh!(refreshedTokens);
      await Promise.all([first, second]);

      // Exactly one refresh-token redemption was issued.
      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalledTimes(1);
      // Both callers set the connection's tokens with the same refreshed value.
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(refreshedTokens);
    });

    it('should keep the in-flight silent-refresh lock until the aborted refresh settles', async () => {
      // A timed-out caller should fall back to interactive OAuth immediately,
      // but the shared lock must remain briefly while the underlying abortable
      // refresh settles so another 401 cannot immediately redeem the same
      // rotating refresh token.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'late-refresh',
        refresh_token: 'refresh456',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };
      let refreshSignal: AbortSignal | undefined;
      let resolveRefresh: ((tokens: MCPOAuthTokens) => void) | undefined;
      mockMCPTokenStorage.forceRefreshTokens.mockImplementationOnce((params) => {
        refreshSignal = params.signal;
        return new Promise<MCPOAuthTokens>((resolve) => {
          resolveRefresh = resolve;
        });
      });
      // Provide a no-op interactive fallback so the handler can complete.
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-x',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(null);
      mockConnectionInstance.connect.mockRejectedValue(new Error('OAuth authentication required'));
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
        // Expected — initial connection mocked to fail.
      }

      // Switch to fake timers only for the silent-refresh attempt so we can
      // fast-forward past its timeout without slowing the test suite.
      jest.useFakeTimers();
      try {
        const firstAttempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await jest.advanceTimersByTimeAsync(2_001);
        await firstAttempt;

        const inflightMap = (
          MCPConnectionFactory as unknown as {
            inflightSilentRefreshes: Map<string, unknown>;
          }
        ).inflightSilentRefreshes;
        expect(inflightMap.size).toBe(1);
        expect(refreshSignal?.aborted).toBe(true);
        expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();

        const secondAttempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await secondAttempt;
        expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalledTimes(1);

        resolveRefresh!(refreshedTokens);
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve();
        }
        expect(inflightMap.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should drop timed-out silent-refresh locks after abort grace if refresh stays hung', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      let firstRefreshSignal: AbortSignal | undefined;
      let secondRefreshSignal: AbortSignal | undefined;
      mockMCPTokenStorage.forceRefreshTokens
        .mockImplementationOnce((params) => {
          firstRefreshSignal = params.signal;
          return new Promise<MCPOAuthTokens>(() => {});
        })
        .mockImplementationOnce((params) => {
          secondRefreshSignal = params.signal;
          return Promise.resolve(null as unknown as MCPOAuthTokens);
        });
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-x',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(null);
      mockConnectionInstance.connect.mockRejectedValue(new Error('OAuth authentication required'));
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
        // Expected
      }

      jest.useFakeTimers();
      try {
        const firstAttempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await jest.advanceTimersByTimeAsync(2_001);
        await firstAttempt;

        const inflightMap = (
          MCPConnectionFactory as unknown as {
            inflightSilentRefreshes: Map<string, unknown>;
          }
        ).inflightSilentRefreshes;
        expect(inflightMap.size).toBe(1);
        expect(firstRefreshSignal?.aborted).toBe(true);

        await jest.advanceTimersByTimeAsync(1_001);
        expect(inflightMap.size).toBe(0);

        const secondAttempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await secondAttempt;

        expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalledTimes(2);
        expect(secondRefreshSignal).toBeDefined();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should reserve interactive OAuth fallback time when initTimeout is omitted', async () => {
      const sseConfig = {
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      let refreshSignal: AbortSignal | undefined;
      mockMCPTokenStorage.forceRefreshTokens.mockImplementationOnce((params) => {
        refreshSignal = params.signal;
        return new Promise<MCPOAuthTokens>(() => {});
      });
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-x',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(null);
      mockConnectionInstance.connect.mockRejectedValue(new Error('OAuth authentication required'));
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
        // Expected
      }

      jest.useFakeTimers();
      try {
        const attempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await jest.advanceTimersByTimeAsync(5_001);
        await attempt;

        expect(refreshSignal?.aborted).toBe(true);
        expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should cap silent refresh below half of a small connection timeout', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
        initTimeout: 5000,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      let refreshSignal: AbortSignal | undefined;
      mockMCPTokenStorage.forceRefreshTokens.mockImplementationOnce((params) => {
        refreshSignal = params.signal;
        return new Promise<MCPOAuthTokens>(() => {});
      });
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-x',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(null);
      mockConnectionInstance.connect.mockRejectedValue(new Error('OAuth authentication required'));
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
        // Expected
      }

      jest.useFakeTimers();
      try {
        const attempt = oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });
        await jest.advanceTimersByTimeAsync(1_999);
        expect(refreshSignal?.aborted).not.toBe(true);
        expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(2);
        await attempt;

        expect(refreshSignal?.aborted).toBe(true);
        expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('should skip silent refresh for 403 OAuth reauthorization failures', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-x',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(null);
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
        // Expected
      }

      const forbiddenError = Object.assign(new Error('Non-200 status code (403)'), { code: 403 });
      await oauthRequiredHandler!({
        serverUrl: 'https://api.example.com',
        error: forbiddenError,
      });

      expect(mockMCPTokenStorage.forceRefreshTokens).not.toHaveBeenCalled();
      expect(mockConnectionInstance.setOAuthTokens).not.toHaveBeenCalled();
      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
    });

    it('should not process already resolved configs for request OAuth handlers', () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com/${SHOULD_NOT_EXPAND}',
        type: 'sse' as const,
      } as t.SSEOptions;
      mockProcessMCPEnv.mockClear();

      const cleanup = MCPConnectionFactory.attachRequestOAuthHandler(
        {
          serverName: 'test-server',
          serverConfig: sseConfig,
          skipEnvProcessing: true,
        },
        {
          useOAuth: true,
          user: mockUser,
          flowManager: mockFlowManager,
          oauthStart: jest.fn(),
        },
        mockConnectionInstance,
      );

      expect(mockProcessMCPEnv).not.toHaveBeenCalled();
      expect(mockConnectionInstance.on).toHaveBeenCalledWith(
        'oauthReauthenticationRequired',
        expect.any(Function),
      );

      cleanup();
    });

    it('should not reuse request-scoped OAuth callbacks after connection is cached', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthStart = jest.fn();
      const oauthEnd = jest.fn();
      const requestAbortController = new AbortController();
      const initialTokens: MCPOAuthTokens = {
        access_token: 'initial-access',
        refresh_token: 'initial-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart,
        oauthEnd,
        signal: requestAbortController.signal,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockFlowManager.createFlowWithHandler.mockResolvedValue(initialTokens);
      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      let oauthRequiredHandler: (data: Record<string, unknown>) => Promise<void>;
      mockConnectionInstance.on.mockImplementation((event, handler) => {
        if (event === 'oauthRequired') {
          oauthRequiredHandler = handler as (data: Record<string, unknown>) => Promise<void>;
        }
        return mockConnectionInstance;
      });

      await MCPConnectionFactory.create(basicOptions, oauthOptions);

      requestAbortController.abort();
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);

      await oauthRequiredHandler!({
        serverUrl: 'https://api.example.com',
        error: new Error('Non-200 status code (401)'),
      });

      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(mockFlowManager.initFlow).not.toHaveBeenCalled();
      expect(mockFlowManager.createFlow).not.toHaveBeenCalled();
      expect(oauthStart).not.toHaveBeenCalled();
      expect(oauthEnd).not.toHaveBeenCalled();
      expect(mockConnectionInstance.emit).toHaveBeenCalledWith(
        'oauthFailed',
        expect.objectContaining({ message: 'OAuth reauthentication required' }),
      );
    });

    it('should clear request-scoped OAuth callbacks after successful connection', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;
      const initialTokens: MCPOAuthTokens = {
        access_token: 'initial-access',
        refresh_token: 'initial-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };
      const oauthStart = jest.fn();
      const oauthEnd = jest.fn();
      const requestAbortController = new AbortController();
      const factory = new InspectableMCPConnectionFactory(
        {
          serverName: 'test-server',
          serverConfig: sseConfig,
        },
        {
          useOAuth: true,
          user: mockUser,
          flowManager: mockFlowManager,
          oauthStart,
          oauthEnd,
          signal: requestAbortController.signal,
          returnOnOAuth: true,
          tokenMethods: {
            findToken: jest.fn(),
            createToken: jest.fn(),
            updateToken: jest.fn(),
            deleteTokens: jest.fn(),
          },
        },
      );

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(initialTokens);
      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await factory.createConnectionForTest();

      expect(mockConnectionInstance.on).toHaveBeenCalledWith('oauthRequired', expect.any(Function));
      expect(factory.getRequestScopedOAuthState()).toEqual({
        signal: undefined,
        oauthStart: undefined,
        oauthEnd: undefined,
        returnOnOAuth: false,
      });
    });

    it('should let a live request handle cached-connection reauthentication with fresh callbacks', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const staleOAuthStart = jest.fn();
      const liveOAuthStart = jest.fn();
      const initialTokens: MCPOAuthTokens = {
        access_token: 'initial-access',
        refresh_token: 'initial-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };
      const callbackTokens: MCPOAuthTokens = {
        access_token: 'callback-access',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockFlowManager.createFlowWithHandler.mockResolvedValue(initialTokens);
      mockFlowManager.createFlow.mockResolvedValue(callbackTokens);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'state-live',
          clientInfo: { client_id: 'client-live' },
        },
      });
      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);
      type Listener = (...args: unknown[]) => void;
      const handlers: Record<string, Listener[]> = {};
      mockConnectionInstance.on.mockImplementation((event, handler) => {
        const key = typeof event === 'symbol' ? event.toString() : event;
        (handlers[key] ??= []).push(handler as Listener);
        return mockConnectionInstance;
      });
      mockConnectionInstance.removeListener.mockImplementation((event, handler) => {
        const key = typeof event === 'symbol' ? event.toString() : event;
        const list = handlers[key];
        const index = list?.indexOf(handler as Listener) ?? -1;
        if (list && index !== -1) {
          list.splice(index, 1);
        }
        return mockConnectionInstance;
      });
      mockConnectionInstance.emit.mockImplementation((event, ...args) => {
        const key = typeof event === 'symbol' ? event.toString() : event;
        const list = handlers[key];
        if (!list?.length) {
          return false;
        }
        for (const fn of [...list]) {
          fn(...args);
        }
        return true;
      });

      await MCPConnectionFactory.create(basicOptions, {
        useOAuth: true,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: staleOAuthStart,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      });

      const liveStarted = new Promise<void>((resolve) => {
        liveOAuthStart.mockImplementation(async () => {
          resolve();
        });
      });
      const cleanup = MCPConnectionFactory.attachRequestOAuthHandler(
        basicOptions,
        {
          useOAuth: true,
          user: mockUser,
          flowManager: mockFlowManager,
          oauthStart: liveOAuthStart,
          tokenMethods: {
            findToken: jest.fn(),
            createToken: jest.fn(),
            updateToken: jest.fn(),
            deleteTokens: jest.fn(),
          },
        },
        mockConnectionInstance,
      );
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);

      mockConnectionInstance.emit('oauthRequired', {
        serverUrl: 'https://api.example.com',
        error: new Error('Non-200 status code (401)'),
      });

      await liveStarted;

      expect(staleOAuthStart).not.toHaveBeenCalled();
      expect(liveOAuthStart).toHaveBeenCalledWith('https://auth.example.com');
      expect(handlers.oauthReauthenticationRequired.length).toBe(1);

      cleanup();

      expect(handlers.oauthReauthenticationRequired.length).toBe(0);
    });

    it('should invalidate completed mcp_oauth cache before falling through to interactive OAuth', async () => {
      // Regression for the Codex finding "Bypass completed OAuth cache after a
      // rejected token": when silent refresh returns null and the handler
      // falls through to interactive OAuth, any recently COMPLETED mcp_oauth
      // flow must be cleared so the fast-reuse path in `handleOAuthRequired`
      // can't hand back the very tokens the resource server just rejected.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const completedFlowState = {
        status: 'COMPLETED' as const,
        type: 'mcp_oauth',
        metadata: { state: 'old-csrf-state' },
        createdAt: Date.now(),
        completedAt: Date.now(),
        result: {
          access_token: 'just-rejected',
          token_type: 'Bearer',
          obtained_at: Date.now(),
        } as MCPOAuthTokens,
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);
      // First lookup (from invalidateCompletedOAuthFlow) sees the stale
      // COMPLETED state with the just-rejected tokens; the second lookup
      // (inside handleOAuthRequired, after deletion) sees nothing and goes
      // straight to a fresh interactive OAuth flow.
      mockFlowManager.getFlowState
        .mockResolvedValueOnce(completedFlowState)
        .mockResolvedValue(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'fresh-csrf-state',
        },
      });
      mockFlowManager.createFlow.mockResolvedValue({
        access_token: 'freshly-issued',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      } as MCPOAuthTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      // Completed `mcp_oauth` flow was deleted before the interactive path ran.
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith('flow123', 'mcp_oauth');
      // And the old CSRF state mapping was cleaned up alongside it.
      expect(mockMCPOAuthHandler.deleteStateMapping).toHaveBeenCalledWith(
        'old-csrf-state',
        mockFlowManager,
      );
    });

    it('should not invalidate a completed mcp_oauth flow from another tenant', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const tenantBCompletedFlow = {
        status: 'COMPLETED' as const,
        type: 'mcp_oauth',
        metadata: { state: 'tenant-b-state', tenantId: 'tenant-b' },
        createdAt: Date.now(),
        completedAt: Date.now(),
        result: {
          access_token: 'tenant-b-token',
          token_type: 'Bearer',
          obtained_at: Date.now(),
        } as MCPOAuthTokens,
      };

      (getTenantId as jest.Mock).mockReturnValue('tenant-a');
      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);
      mockFlowManager.getFlowState
        .mockResolvedValueOnce(tenantBCompletedFlow)
        .mockResolvedValue(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'tenant-a-state',
        },
      });
      mockFlowManager.createFlow.mockResolvedValue(null);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockFlowManager.getFlowState).toHaveBeenCalledWith('flow123', 'mcp_oauth');
      expect(mockFlowManager.deleteFlow).not.toHaveBeenCalledWith('flow123', 'mcp_oauth');
      expect(mockMCPOAuthHandler.deleteStateMapping).not.toHaveBeenCalledWith(
        'tenant-b-state',
        mockFlowManager,
      );
      expect(mockFlowManager.initFlow).toHaveBeenCalledWith(
        'flow123',
        'mcp_oauth',
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
    });

    it('should tenant-scope mcp_oauth flow lookup before completed-flow reuse', async () => {
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const tenantFlowId = 'tenant:tenant-a:user123:test-server';

      (getTenantId as jest.Mock).mockReturnValue('tenant-a');
      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: tenantFlowId,
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'tenant-a-state',
          tenantId: 'tenant-a',
        },
      });
      mockFlowManager.createFlow.mockResolvedValue(null);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockFlowManager.getFlowState).toHaveBeenCalledWith(tenantFlowId, 'mcp_oauth');
      expect(mockFlowManager.getFlowState).not.toHaveBeenCalledWith(
        'user123:test-server',
        'mcp_oauth',
      );
      expect(mockFlowManager.initFlow).toHaveBeenCalledWith(
        tenantFlowId,
        'mcp_oauth',
        expect.objectContaining({ tenantId: 'tenant-a' }),
      );
    });

    it('should scope the silent-refresh in-flight lock by tenant', async () => {
      // Regression for the Codex finding "Scope silent refresh lock by
      // tenant": two tenants that share the same `userId` and `serverName`
      // (e.g. when IDs are username-based) must not join each other's
      // in-flight refresh; otherwise tokens minted under tenant A's
      // refresh-token would be applied to a tenant-B connection.
      const tenantMock = getTenantId as jest.MockedFunction<typeof getTenantId>;

      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const tenantATokens: MCPOAuthTokens = {
        access_token: 'tenant-a-access',
        refresh_token: 'tenant-a-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };
      const tenantBTokens: MCPOAuthTokens = {
        access_token: 'tenant-b-access',
        refresh_token: 'tenant-b-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      let oauthRequiredHandler: (data: Record<string, unknown>) => Promise<void>;
      mockConnectionInstance.on.mockImplementation((event, handler) => {
        if (event === 'oauthRequired') {
          oauthRequiredHandler = handler as (data: Record<string, unknown>) => Promise<void>;
        }
        return mockConnectionInstance;
      });

      // Build a factory whose tenantId was captured as "tenant-a", trigger a
      // refresh, then build a second factory under "tenant-b" with the same
      // userId and serverName. Each refresh must call `forceRefreshTokens`
      // independently and apply its own tokens.
      tenantMock.mockReturnValue('tenant-a');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(tenantATokens);

      try {
        await MCPConnectionFactory.create(basicOptions, oauthOptions);
      } catch {
        // Expected
      }
      const tenantAHandler = oauthRequiredHandler!;

      // Reset oauthRequiredHandler capture for the second factory.
      tenantMock.mockReturnValue('tenant-b');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(tenantBTokens);

      try {
        await MCPConnectionFactory.create(basicOptions, oauthOptions);
      } catch {
        // Expected
      }
      const tenantBHandler = oauthRequiredHandler!;

      await Promise.all([
        tenantAHandler({ serverUrl: 'https://api.example.com' }),
        tenantBHandler({ serverUrl: 'https://api.example.com' }),
      ]);

      // Each tenant ran its own refresh and applied its own tokens — no
      // cross-tenant coalescing.
      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalledTimes(2);
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(tenantATokens);
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(tenantBTokens);
    });

    it('should restore captured tenant context while silently refreshing tokens', async () => {
      const capturedContext = {
        tenantId: 'tenant-a',
        userId: 'user123',
        requestId: 'req-123',
      };
      mockTenantStorage.getStore.mockReturnValueOnce(capturedContext);

      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'tenant-access',
        refresh_token: 'tenant-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(refreshedTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockTenantStorage.run).toHaveBeenCalledWith(capturedContext, expect.any(Function));
      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalled();
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(refreshedTokens);
    });

    it('should NOT delete a PENDING mcp_get_tokens flow after silent refresh', async () => {
      // Regression for the Codex findings around active token-fetch flows:
      // concurrent `getOAuthTokens` callers may be joined to a PENDING
      // `mcp_get_tokens` flow via `monitorFlow`. Deleting it under them makes
      // waiters fail; leaving it alone lets a stale handler publish rejected
      // tokens later. Completing the flow with the fresh tokens solves both.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
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

      const refreshedTokens: MCPOAuthTokens = {
        access_token: 'refreshed-access',
        refresh_token: 'refresh789',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      (getTenantId as jest.Mock).mockReturnValue('tenant-a');
      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(refreshedTokens);
      // A concurrent `getOAuthTokens` for this user/server is currently
      // PENDING — joiners are monitoring it via `monitorFlow`.
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'PENDING' as const,
        type: 'mcp_get_tokens',
        metadata: {},
        createdAt: Date.now(),
      });
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockMCPTokenStorage.forceRefreshTokens).toHaveBeenCalled();
      expect(mockFlowManager.getFlowState).toHaveBeenCalledWith(
        'tenant:tenant-a:flow123',
        'mcp_get_tokens',
      );
      expect(mockFlowManager.completeFlow).toHaveBeenCalledWith(
        'tenant:tenant-a:flow123',
        'mcp_get_tokens',
        refreshedTokens,
      );
      expect(mockFlowManager.deleteFlow).not.toHaveBeenCalledWith(
        'tenant:tenant-a:flow123',
        'mcp_get_tokens',
      );
    });

    it('should invalidate mcp_get_tokens cache after interactive OAuth stores fresh tokens', async () => {
      // Regression for the Codex finding "Invalidate token cache after
      // interactive fallback": when silent refresh fails but interactive OAuth
      // succeeds, the old `mcp_get_tokens` flow cache could otherwise re-serve
      // stale tokens to the next `getOAuthTokens` call.
      const sseConfig = {
        ...mockServerConfig,
        url: 'https://api.example.com',
        type: 'sse' as const,
      } as t.SSEOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig: sseConfig,
      };

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser,
        flowManager: mockFlowManager,
        oauthStart: jest.fn(),
        oauthEnd: jest.fn(),
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      const interactiveTokens: MCPOAuthTokens = {
        access_token: 'interactive-access',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockProcessMCPEnv.mockReturnValue(sseConfig);
      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow123');
      mockMCPTokenStorage.forceRefreshTokens.mockResolvedValueOnce(null);
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow123',
        flowMetadata: {
          serverName: 'test-server',
          userId: 'user123',
          serverUrl: 'https://api.example.com',
          state: 'fresh-csrf-state',
        },
      });
      // First `getFlowState` (from `invalidateCompletedOAuthFlow`): no
      // completed mcp_oauth flow → no-op. Second (from `handleOAuthRequired`):
      // no existing flow either. Final (from `invalidateGetTokensFlow` after
      // interactive store): a COMPLETED `mcp_get_tokens` cache exists and
      // must be cleared so the next `getOAuthTokens` reads fresh tokens.
      mockFlowManager.getFlowState
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'COMPLETED' as const,
          type: 'mcp_get_tokens',
          metadata: {},
          createdAt: Date.now(),
          completedAt: Date.now(),
          result: {
            access_token: 'old-stale',
            token_type: 'Bearer',
            obtained_at: Date.now(),
          } as MCPOAuthTokens,
        });
      mockFlowManager.createFlow.mockResolvedValue(interactiveTokens);
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
        // Expected
      }

      await oauthRequiredHandler!({ serverUrl: 'https://api.example.com' });

      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(interactiveTokens);
      // The stale `mcp_get_tokens` cache is cleared so the next
      // `getOAuthTokens` reads the freshly persisted interactive tokens.
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith('flow123', 'mcp_get_tokens');
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

    it('should identify "no authorization" errors as OAuth errors (HTTP 400)', async () => {
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

      const noAuthError = new Error(
        'Either no authorization values are specified or it could not be derived from the request',
      );

      mockConnectionInstance.connect.mockRejectedValue(noAuthError);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(MCPConnectionFactory.create(basicOptions, oauthOptions)).rejects.toThrow(
        'no authorization',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth required, stopping connection attempts'),
      );
    });

    it('should identify invalid_grant errors as OAuth errors', async () => {
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

      const invalidGrantError = new Error(
        'Streamable HTTP error: Error POSTing to endpoint: {"error":"invalid_grant"}',
      );

      mockConnectionInstance.connect.mockRejectedValue(invalidGrantError);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(MCPConnectionFactory.create(basicOptions, oauthOptions)).rejects.toThrow(
        'invalid_grant',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OAuth required, stopping connection attempts'),
      );
    });
  });

  describe('discoverTools static method', () => {
    const mockTools = [
      { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Second tool', inputSchema: { type: 'object' } },
    ];

    it('should discover tools from a successfully connected server', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);
      mockConnectionInstance.fetchTools = jest.fn().mockResolvedValue(mockTools);

      const result = await MCPConnectionFactory.discoverTools(basicOptions);

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(false);
      expect(result.oauthUrl).toBeNull();
      expect(result.connection).toBe(mockConnectionInstance);
    });

    it('should forward user context to processMCPEnv for non-OAuth discovery', async () => {
      const serverConfig: t.MCPOptions = {
        type: 'streamable-http',
        url: 'https://my-mcp.server.com?key={{MY_CUSTOM_KEY}}',
      } as t.MCPOptions;

      const basicOptions = {
        serverName: 'test-server',
        serverConfig,
      };

      const userContext = {
        user: mockUser,
        customUserVars: { MY_CUSTOM_KEY: 'c527bd0abc123' },
        connectionTimeout: 10000,
      };

      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);
      mockConnectionInstance.fetchTools = jest.fn().mockResolvedValue(mockTools);

      const result = await MCPConnectionFactory.discoverTools(basicOptions, userContext);

      expect(result.tools).toEqual(mockTools);
      expect(mockProcessMCPEnv).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockUser,
          options: serverConfig,
          customUserVars: { MY_CUSTOM_KEY: 'c527bd0abc123' },
        }),
      );
    });

    it('should detect OAuth required without generating URL in discovery mode', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: {
          ...mockServerConfig,
          url: 'https://api.example.com',
          type: 'sse' as const,
        } as t.SSEOptions,
      };

      const mockOAuthStart = jest.fn().mockResolvedValue(undefined);

      const oauthOptions = {
        useOAuth: true as const,
        user: mockUser as unknown as IUser,
        flowManager: mockFlowManager,
        oauthStart: mockOAuthStart,
        tokenMethods: {
          findToken: jest.fn(),
          createToken: jest.fn(),
          updateToken: jest.fn(),
          deleteTokens: jest.fn(),
        },
      };

      mockConnectionInstance.isConnected.mockResolvedValue(false);
      mockConnectionInstance.disconnect = jest.fn().mockResolvedValue(undefined);

      let oauthHandler: (() => void) | undefined;
      mockConnectionInstance.once.mockImplementation((event, handler) => {
        if (event === 'oauthRequired') {
          oauthHandler = handler as () => void;
        }
        return mockConnectionInstance;
      });

      mockConnectionInstance.connect.mockImplementation(async () => {
        if (oauthHandler) {
          oauthHandler();
        }
        throw new Error('OAuth required');
      });

      const result = await MCPConnectionFactory.discoverTools(basicOptions, oauthOptions);

      expect(result.connection).toBeNull();
      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(true);
      expect(result.oauthUrl).toBeNull();
      expect(mockOAuthStart).not.toHaveBeenCalled();
    });

    it('should fast-fail discovery when non-OAuth server returns 401', async () => {
      const basicOptions = {
        serverName: 'github',
        serverConfig: {
          ...mockServerConfig,
          url: 'https://api.githubcopilot.com/mcp/',
          type: 'streamable-http' as const,
          initTimeout: 30000,
        } as t.StreamableHTTPOptions,
      };

      mockConnectionInstance.isConnected.mockResolvedValue(false);
      mockConnectionInstance.disconnect = jest.fn().mockResolvedValue(undefined);

      let oauthHandler: (() => void) | undefined;
      mockConnectionInstance.once.mockImplementation((event, handler) => {
        if (event === 'oauthRequired') {
          oauthHandler = handler as () => void;
        }
        return mockConnectionInstance;
      });

      mockConnectionInstance.connect.mockImplementation(async () => {
        if (oauthHandler) {
          oauthHandler();
        }
        throw Object.assign(new Error('unauthorized'), { code: 401 });
      });

      const start = Date.now();
      const result = await MCPConnectionFactory.discoverTools(basicOptions);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(result.tools).toBeNull();
      expect(result.oauthRequired).toBe(true);
      expect(result.oauthUrl).toBeNull();
      expect(result.connection).toBeNull();
    });

    it('should return null tools when discovery fails completely', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      mockConnectionInstance.connect.mockRejectedValue(new Error('Connection failed'));
      mockConnectionInstance.isConnected.mockResolvedValue(false);
      mockConnectionInstance.disconnect = jest.fn().mockResolvedValue(undefined);

      const result = await MCPConnectionFactory.discoverTools(basicOptions);

      expect(result.tools).toBeNull();
      expect(result.connection).toBeNull();
      expect(result.oauthRequired).toBe(false);
    });

    it('should handle disconnect errors gracefully during cleanup', async () => {
      const basicOptions = {
        serverName: 'test-server',
        serverConfig: mockServerConfig,
      };

      mockConnectionInstance.connect.mockRejectedValue(new Error('Connection failed'));
      mockConnectionInstance.isConnected.mockResolvedValue(false);
      mockConnectionInstance.disconnect = jest
        .fn()
        .mockRejectedValue(new Error('Disconnect failed'));

      const result = await MCPConnectionFactory.discoverTools(basicOptions);

      expect(result.tools).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('proactive OAuth flow', () => {
    const makeOAuthServerConfig = (): t.MCPOptions =>
      ({
        type: 'streamable-http' as const,
        url: 'https://bigquery.googleapis.com/mcp',
        initTimeout: 5000,
        requiresOAuth: true,
      }) as unknown as t.MCPOptions;

    const makeOAuthOptions = () => ({
      useOAuth: true as const,
      user: mockUser,
      flowManager: mockFlowManager,
      tokenMethods: {
        findToken: jest.fn(),
        createToken: jest.fn(),
        updateToken: jest.fn(),
        deleteTokens: jest.fn(),
      },
    });

    function wireEventHandlers(instance: jest.Mocked<MCPConnection>) {
      type Listener = (...args: unknown[]) => void;

      const handlers: Record<string, Listener[]> = {};
      const onceWrappers = new Map<Listener, Listener>();
      const key = (event: string | symbol): string =>
        typeof event === 'symbol' ? event.toString() : event;
      const addHandler = (event: string | symbol, handler: Listener) => {
        (handlers[key(event)] ??= []).push(handler);
      };
      const removeHandler = (event: string | symbol, handler: Listener) => {
        const list = handlers[key(event)];
        if (!list) {
          return;
        }
        const wrapped = onceWrappers.get(handler);
        const handlerToRemove = wrapped ?? handler;
        const index = list.indexOf(handlerToRemove);
        if (index !== -1) {
          list.splice(index, 1);
        }
        if (wrapped) {
          onceWrappers.delete(handler);
        }
      };

      instance.on.mockImplementation((event: string | symbol, handler: Listener) => {
        addHandler(event, handler);
        return instance;
      });

      instance.once.mockImplementation((event: string | symbol, handler: Listener) => {
        const wrapped: Listener = (...args) => {
          removeHandler(event, handler);
          handler(...args);
        };
        onceWrappers.set(handler, wrapped);
        addHandler(event, wrapped);
        return instance;
      });

      instance.off.mockImplementation((event: string | symbol, handler: Listener) => {
        removeHandler(event, handler);
        return instance;
      });

      instance.removeListener.mockImplementation((event: string | symbol, handler: Listener) => {
        removeHandler(event, handler);
        return instance;
      });

      instance.emit.mockImplementation((event: string | symbol, ...args: unknown[]) => {
        const list = handlers[key(event)];
        if (!list || list.length === 0) {
          return false;
        }
        for (const fn of [...list]) {
          fn(...args);
        }
        return true;
      });

      return handlers;
    }

    it('should trigger proactive OAuth when requiresOAuth and no tokens', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('no tokens'));

      const mockTokens: MCPOAuthTokens = {
        access_token: 'bq-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      const mockFlowData = {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?state=xyz',
        flowId: 'flow-bq',
        flowMetadata: {
          serverName: 'bigquery',
          userId: 'user123',
          serverUrl: 'https://bigquery.googleapis.com/mcp',
          state: 'state-xyz',
          clientInfo: { client_id: 'bq-client' },
        },
      };

      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow-bq');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(mockTokens);

      wireEventHandlers(mockConnectionInstance);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'bigquery', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('proactively triggering OAuth flow'),
      );
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(mockTokens);
      expect(mockConnectionInstance.connect).toHaveBeenCalled();
    });

    it('should trigger proactive OAuth when oauth is configured without requiresOAuth', async () => {
      const serverConfig = {
        type: 'streamable-http' as const,
        url: 'https://drivemcp.googleapis.com/mcp/v1',
        initTimeout: 5000,
        oauth: {
          authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_url: 'https://oauth2.googleapis.com/token',
        },
      } as t.ParsedServerConfig;
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);

      const mockTokens: MCPOAuthTokens = {
        access_token: 'drive-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow-drive');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?state=drive',
        flowId: 'flow-drive',
        flowMetadata: {
          serverName: 'drive',
          userId: 'user123',
          serverUrl: 'https://drivemcp.googleapis.com/mcp/v1',
          state: 'state-drive',
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(mockTokens);

      wireEventHandlers(mockConnectionInstance);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'drive', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockMCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalled();
      expect(mockConnectionInstance.setOAuthTokens).toHaveBeenCalledWith(mockTokens);
      expect(mockConnectionInstance.connect).toHaveBeenCalled();
    });

    it('should not trigger proactive OAuth when only OAuth metadata is present', async () => {
      const serverConfig = {
        type: 'streamable-http' as const,
        url: 'https://metadata-only.example.com/mcp',
        initTimeout: 5000,
        oauthMetadata: {
          authorization_servers: ['https://auth.example.com/'],
        },
      } as t.ParsedServerConfig;
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'metadata-only', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(mockConnectionInstance.connect).toHaveBeenCalled();
    });

    it('should NOT trigger proactive OAuth when useOAuth is true but requiresOAuth is absent', async () => {
      const serverConfig = {
        command: 'node',
        args: ['server.js'],
        initTimeout: 5000,
      } as t.MCPOptions;

      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('no tokens'));
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'test-server', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('proactively triggering OAuth flow'),
      );
    });

    it('should not trigger proactive OAuth when requiresOAuth is explicitly false', async () => {
      const serverConfig = {
        type: 'streamable-http' as const,
        url: 'https://api.example.com/mcp',
        initTimeout: 5000,
        requiresOAuth: false,
        oauth: {
          authorization_url: 'https://auth.example.com/oauth/authorize',
          token_url: 'https://auth.example.com/oauth/token',
        },
      } as t.MCPOptions;
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'test-server', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('proactively triggering OAuth flow'),
      );
    });

    it('should skip proactive OAuth when tokens already exist', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      const existingTokens: MCPOAuthTokens = {
        access_token: 'existing-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };
      mockFlowManager.createFlowWithHandler.mockResolvedValue(existingTokens);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      const connection = await MCPConnectionFactory.create(
        { serverName: 'bigquery', serverConfig },
        oauthOptions,
      );

      expect(connection).toBe(mockConnectionInstance);
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('proactively triggering OAuth flow'),
      );
    });

    it('should reject when proactive OAuth flow fails', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = {
        ...makeOAuthOptions(),
        returnOnOAuth: true,
        oauthStart: jest.fn(),
      };

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('no tokens'));

      const mockFlowData = {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/auth',
        flowId: 'flow-bq',
        flowMetadata: {
          serverName: 'bigquery',
          userId: 'user123',
          serverUrl: 'https://bigquery.googleapis.com/mcp',
          state: 'state-xyz',
        },
      };

      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow-bq');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue(mockFlowData);
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockReturnValue(new Promise(() => {}));

      wireEventHandlers(mockConnectionInstance);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(
        MCPConnectionFactory.create({ serverName: 'bigquery', serverConfig }, oauthOptions),
      ).rejects.toThrow('OAuth flow initiated - return early');
    });

    it('should throw when requiresOAuth is true but url is missing', async () => {
      const serverConfig = {
        type: 'streamable-http' as const,
        initTimeout: 5000,
        requiresOAuth: true,
      } as unknown as t.MCPOptions;

      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('no tokens'));

      wireEventHandlers(mockConnectionInstance);
      mockConnectionInstance.isConnected.mockResolvedValue(false);

      await expect(
        MCPConnectionFactory.create({ serverName: 'no-url', serverConfig }, oauthOptions),
      ).rejects.toThrow('server URL is missing');
    });

    it('should reject when proactive OAuth has no registered handler', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);
      mockConnectionInstance.on.mockReturnValue(mockConnectionInstance);
      mockConnectionInstance.once.mockReturnValue(mockConnectionInstance);
      mockConnectionInstance.off.mockReturnValue(mockConnectionInstance);
      mockConnectionInstance.emit.mockReturnValue(false);

      await expect(
        MCPConnectionFactory.create({ serverName: 'bigquery', serverConfig }, oauthOptions),
      ).rejects.toThrow('OAuth required but no handler is registered');

      expect(mockConnectionInstance.connect).not.toHaveBeenCalled();
    });

    it('should clean up cross-listeners when oauthHandled fires', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = makeOAuthOptions();

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockRejectedValue(new Error('no tokens'));

      const mockTokens: MCPOAuthTokens = {
        access_token: 'cleanup-token',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      };

      mockMCPOAuthHandler.generateFlowId.mockReturnValue('flow-cleanup');
      mockMCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://auth.example.com',
        flowId: 'flow-cleanup',
        flowMetadata: {
          serverName: 'bigquery',
          userId: 'user123',
          serverUrl: 'https://bigquery.googleapis.com/mcp',
          state: 'state-cleanup',
          clientInfo: { client_id: 'client-cleanup' },
        },
      });
      mockFlowManager.getFlowState.mockResolvedValue(null);
      mockFlowManager.createFlow.mockResolvedValue(mockTokens);

      const handlers = wireEventHandlers(mockConnectionInstance);
      mockConnectionInstance.isConnected.mockResolvedValue(true);

      await MCPConnectionFactory.create({ serverName: 'bigquery', serverConfig }, oauthOptions);

      // After oauthHandled resolved, the oauthFailed listener should have been removed
      const failedListeners = handlers['oauthFailed'] ?? [];
      expect(failedListeners.length).toBe(0);
    });

    it('should not trigger proactive OAuth during tool discovery', async () => {
      const serverConfig = makeOAuthServerConfig();
      const oauthOptions = {
        ...makeOAuthOptions(),
        oauthStart: jest.fn(),
      };
      const mockTools = [
        { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
      ];

      mockProcessMCPEnv.mockReturnValue(serverConfig);
      mockFlowManager.createFlowWithHandler.mockResolvedValue(null);
      mockConnectionInstance.connect.mockResolvedValue(undefined);
      mockConnectionInstance.isConnected.mockResolvedValue(true);
      mockConnectionInstance.fetchTools = jest.fn().mockResolvedValue(mockTools);

      const result = await MCPConnectionFactory.discoverTools(
        { serverName: 'bigquery', serverConfig },
        oauthOptions,
      );

      expect(result.tools).toEqual(mockTools);
      expect(result.oauthRequired).toBe(false);
      expect(oauthOptions.oauthStart).not.toHaveBeenCalled();
      expect(mockMCPOAuthHandler.initiateOAuthFlow).not.toHaveBeenCalled();
    });
  });
});
