const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { getBasePath } = require('@librechat/api');
const { MongoMemoryServer } = require('mongodb-memory-server');

function generateTestCsrfToken(flowId) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(flowId)
    .digest('hex')
    .slice(0, 32);
}

const mockRegistryInstance = {
  getServerConfig: jest.fn(),
  getOAuthServers: jest.fn(),
  getAllServerConfigs: jest.fn(),
  ensureConfigServers: jest.fn().mockResolvedValue({}),
  addServer: jest.fn(),
  updateServer: jest.fn(),
  removeServer: jest.fn(),
};

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    ...actual,
    MCPOAuthHandler: {
      initiateOAuthFlow: jest.fn(),
      getFlowState: jest.fn(),
      completeOAuthFlow: jest.fn(),
      generateFlowId: jest.fn(),
      resolveStateToFlowId: jest.fn(async (state) => state),
      storeStateMapping: jest.fn(),
      deleteStateMapping: jest.fn(),
    },
    MCPTokenStorage: {
      storeTokens: jest.fn(),
      getClientInfoAndMetadata: jest.fn(),
      getTokens: jest.fn(),
      deleteUserTokens: jest.fn(),
    },
    getUserMCPAuthMap: jest.fn(),
    generateCheckAccess: jest.fn(() => (req, res, next) => next()),
    MCPServersRegistry: {
      getInstance: () => mockRegistryInstance,
    },
    // Error handling utilities (from @librechat/api mcp/errors)
    isMCPDomainNotAllowedError: (error) => error?.code === 'MCP_DOMAIN_NOT_ALLOWED',
    isMCPInspectionFailedError: (error) => error?.code === 'MCP_INSPECTION_FAILED',
    MCPErrorCodes: {
      DOMAIN_NOT_ALLOWED: 'MCP_DOMAIN_NOT_ALLOWED',
      INSPECTION_FAILED: 'MCP_INSPECTION_FAILED',
    },
  };
});

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createModels: jest.fn(() => ({
    User: {
      findOne: jest.fn(),
      findById: jest.fn(),
    },
    Conversation: {
      findOne: jest.fn(),
      findById: jest.fn(),
    },
  })),
  createMethods: jest.fn(() => ({
    findUser: jest.fn(),
  })),
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  updateToken: jest.fn(),
  createToken: jest.fn(),
  deleteTokens: jest.fn(),
  findPluginAuthsByKeys: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn(),
  loadCustomConfig: jest.fn(),
  getAppConfig: jest.fn().mockResolvedValue({ mcpConfig: {} }),
}));

jest.mock('~/server/services/Config/mcp', () => ({
  updateMCPServerTools: jest.fn(),
}));

const mockResolveAllMcpConfigs = jest.fn().mockResolvedValue({});
jest.mock('~/server/services/MCP', () => ({
  getMCPSetupData: jest.fn(),
  resolveConfigServers: jest.fn().mockResolvedValue({}),
  resolveAllMcpConfigs: (...args) => mockResolveAllMcpConfigs(...args),
  getServerConnectionStatus: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
  getMCPServersRegistry: jest.fn(() => mockRegistryInstance),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessMCPServerResource: () => (req, res, next) => next(),
}));

jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));

describe('MCP Routes', () => {
  let app;
  let mongoServer;
  let mcpRouter;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    require('~/db/models');

    mcpRouter = require('../mcp');

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.use((req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    });

    app.use('/api/mcp', mcpRouter);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:serverName/oauth/initiate', () => {
    const { MCPOAuthHandler } = require('@librechat/api');
    const { getLogStores } = require('~/cache');

    it('should initiate OAuth flow successfully', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          metadata: {
            serverUrl: 'https://test-server.com',
            oauth: { clientId: 'test-client-id' },
          },
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      mockRegistryInstance.getServerConfig.mockResolvedValue({});

      MCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://oauth.example.com/auth',
        flowId: 'test-user-id:test-server',
        flowMetadata: { state: 'random-state-value' },
      });
      MCPOAuthHandler.storeStateMapping.mockResolvedValue();
      mockFlowManager.initFlow = jest.fn().mockResolvedValue();

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://oauth.example.com/auth');
      expect(MCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalledWith(
        'test-server',
        'https://test-server.com',
        'test-user-id',
        {},
        { clientId: 'test-client-id' },
      );
    });

    it('should return 403 when userId does not match authenticated user', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'different-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'User mismatch' });
    });

    it('should return 404 when flow state is not found', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue(null),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'non-existent-flow-id',
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Flow not found' });
    });

    it('should return 400 when flow state has missing OAuth config', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          metadata: {
            serverUrl: 'https://test-server.com',
          },
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid flow state' });
    });

    it('should return 500 when OAuth initiation throws unexpected error', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to initiate OAuth' });
    });

    it('should return 400 when flow state metadata is null', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          id: 'test-user-id:test-server',
          metadata: null,
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-user-id:test-server',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid flow state' });
    });
  });

  describe('GET /:serverName/oauth/callback', () => {
    const { MCPOAuthHandler, MCPTokenStorage } = require('@librechat/api');
    const { getLogStores } = require('~/cache');

    it('should redirect to error page when OAuth error is received', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        error: 'access_denied',
        state: 'test-user-id:test-server',
      });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=access_denied`);
    });

    describe('OAuth error callback failFlow', () => {
      it('should fail the flow when OAuth error is received with valid CSRF cookie', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          failFlow: jest.fn().mockResolvedValue(true),
        };

        getLogStores.mockReturnValueOnce({});
        require('~/config').getFlowStateManager.mockReturnValueOnce(mockFlowManager);
        MCPOAuthHandler.resolveStateToFlowId.mockResolvedValueOnce(flowId);

        const csrfToken = generateTestCsrfToken(flowId);
        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .set('Cookie', [`oauth_csrf=${csrfToken}`])
          .query({
            error: 'invalid_client',
            state: flowId,
          });
        const basePath = getBasePath();

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${basePath}/oauth/error?error=invalid_client`);
        expect(mockFlowManager.failFlow).toHaveBeenCalledWith(
          flowId,
          'mcp_oauth',
          'invalid_client',
        );
      });

      it('should fail the flow when OAuth error is received with valid session cookie', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          failFlow: jest.fn().mockResolvedValue(true),
        };

        getLogStores.mockReturnValueOnce({});
        require('~/config').getFlowStateManager.mockReturnValueOnce(mockFlowManager);
        MCPOAuthHandler.resolveStateToFlowId.mockResolvedValueOnce(flowId);

        const sessionToken = generateTestCsrfToken('test-user-id');
        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .set('Cookie', [`oauth_session=${sessionToken}`])
          .query({
            error: 'invalid_client',
            state: flowId,
          });
        const basePath = getBasePath();

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${basePath}/oauth/error?error=invalid_client`);
        expect(mockFlowManager.failFlow).toHaveBeenCalledWith(
          flowId,
          'mcp_oauth',
          'invalid_client',
        );
      });

      it('should NOT fail the flow when OAuth error is received without cookies (DoS prevention)', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          failFlow: jest.fn(),
        };

        getLogStores.mockReturnValueOnce({});
        require('~/config').getFlowStateManager.mockReturnValueOnce(mockFlowManager);
        MCPOAuthHandler.resolveStateToFlowId.mockResolvedValueOnce(flowId);

        const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
          error: 'invalid_client',
          state: flowId,
        });
        const basePath = getBasePath();

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(`${basePath}/oauth/error?error=invalid_client`);
        expect(mockFlowManager.failFlow).not.toHaveBeenCalled();
      });
    });

    it('should redirect to error page when code is missing', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        state: 'test-user-id:test-server',
      });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=missing_code`);
    });

    it('should redirect to error page when state is missing', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
      });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=missing_state`);
    });

    it('should redirect to error page when CSRF cookie is missing', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'test-user-id:test-server',
      });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        `${basePath}/oauth/error?error=csrf_validation_failed`,
      );
    });

    it('should redirect to error page when CSRF cookie does not match state', async () => {
      const csrfToken = generateTestCsrfToken('different-flow-id');
      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: 'test-user-id:test-server',
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        `${basePath}/oauth/error?error=csrf_validation_failed`,
      );
    });

    it('should redirect to error page when flow state is not found', async () => {
      MCPOAuthHandler.getFlowState.mockResolvedValue(null);
      const flowId = 'invalid-flow:id';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=invalid_state`);
    });

    describe('CSRF fallback via active PENDING flow', () => {
      it('should proceed when a fresh PENDING flow exists and no cookies are present', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          getFlowState: jest.fn().mockResolvedValue({
            status: 'PENDING',
            createdAt: Date.now(),
          }),
          completeFlow: jest.fn().mockResolvedValue(true),
          deleteFlow: jest.fn().mockResolvedValue(true),
        };
        const mockFlowState = {
          serverName: 'test-server',
          userId: 'test-user-id',
          metadata: {},
          clientInfo: {},
          codeVerifier: 'test-verifier',
        };

        getLogStores.mockReturnValue({});
        require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
        MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
        MCPOAuthHandler.completeOAuthFlow.mockResolvedValue({
          access_token: 'test-token',
        });
        MCPTokenStorage.storeTokens.mockResolvedValue();
        mockRegistryInstance.getServerConfig.mockResolvedValue({});

        const mockMcpManager = {
          getUserConnection: jest.fn().mockResolvedValue({
            fetchTools: jest.fn().mockResolvedValue([]),
          }),
        };
        require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
        require('~/config').getOAuthReconnectionManager.mockReturnValue({
          clearReconnection: jest.fn(),
        });
        require('~/server/services/Config/mcp').updateMCPServerTools.mockResolvedValue();

        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .query({ code: 'test-code', state: flowId });

        const basePath = getBasePath();
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain(`${basePath}/oauth/success`);
      });

      it('should reject when no PENDING flow exists and no cookies are present', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          getFlowState: jest.fn().mockResolvedValue(null),
        };

        getLogStores.mockReturnValue({});
        require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .query({ code: 'test-code', state: flowId });

        const basePath = getBasePath();
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
          `${basePath}/oauth/error?error=csrf_validation_failed`,
        );
      });

      it('should reject when only a COMPLETED flow exists (not PENDING)', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          getFlowState: jest.fn().mockResolvedValue({
            status: 'COMPLETED',
            createdAt: Date.now(),
          }),
        };

        getLogStores.mockReturnValue({});
        require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .query({ code: 'test-code', state: flowId });

        const basePath = getBasePath();
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
          `${basePath}/oauth/error?error=csrf_validation_failed`,
        );
      });

      it('should reject when PENDING flow is stale (older than PENDING_STALE_MS)', async () => {
        const flowId = 'test-user-id:test-server';
        const mockFlowManager = {
          getFlowState: jest.fn().mockResolvedValue({
            status: 'PENDING',
            createdAt: Date.now() - 3 * 60 * 1000,
          }),
        };

        getLogStores.mockReturnValue({});
        require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

        const response = await request(app)
          .get('/api/mcp/test-server/oauth/callback')
          .query({ code: 'test-code', state: flowId });

        const basePath = getBasePath();
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
          `${basePath}/oauth/error?error=csrf_validation_failed`,
        );
      });
    });

    it('should handle OAuth callback successfully', async () => {
      // mockRegistryInstance is defined at the top of the file
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([
          {
            name: 'test-tool',
            description: 'A test tool',
            inputSchema: { type: 'object' },
          },
        ]),
      };
      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      const { Constants } = require('librechat-data-provider');
      getCachedTools.mockResolvedValue({
        [`existing-tool${Constants.mcp_delimiter}test-server`]: { type: 'function' },
        [`other-tool${Constants.mcp_delimiter}other-server`]: { type: 'function' },
      });
      setCachedTools.mockResolvedValue();

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);
      expect(MCPOAuthHandler.completeOAuthFlow).toHaveBeenCalledWith(
        flowId,
        'test-auth-code',
        mockFlowManager,
        {},
      );
      expect(MCPTokenStorage.storeTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          serverName: 'test-server',
          tokens: mockTokens,
          clientInfo: mockFlowState.clientInfo,
          metadata: mockFlowState.metadata,
        }),
      );
      const storeInvocation = MCPTokenStorage.storeTokens.mock.invocationCallOrder[0];
      const connectInvocation = mockMcpManager.getUserConnection.mock.invocationCallOrder[0];
      expect(storeInvocation).toBeLessThan(connectInvocation);
      expect(mockFlowManager.completeFlow).toHaveBeenCalledWith(
        'tool-flow-123',
        'mcp_oauth',
        mockTokens,
      );
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith(
        'test-user-id:test-server',
        'mcp_get_tokens',
      );
    });

    it('should use oauthHeaders from flow state when present', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
        oauthHeaders: { 'X-Custom-Auth': 'header-value' },
      };
      const mockTokens = { access_token: 'tok', refresh_token: 'ref' };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      require('~/config').getOAuthReconnectionManager.mockReturnValue({
        clearReconnection: jest.fn(),
      });
      require('~/config').getMCPManager.mockReturnValue({
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest.fn().mockResolvedValue([]),
        }),
      });
      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({ code: 'auth-code', state: flowId });

      expect(MCPOAuthHandler.completeOAuthFlow).toHaveBeenCalledWith(
        flowId,
        'auth-code',
        mockFlowManager,
        { 'X-Custom-Auth': 'header-value' },
      );
      expect(mockRegistryInstance.getServerConfig).not.toHaveBeenCalled();
    });

    it('should fall back to registry oauth_headers when flow state lacks them', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = { access_token: 'tok', refresh_token: 'ref' };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({
        oauth_headers: { 'X-Registry-Header': 'from-registry' },
      });
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      require('~/config').getOAuthReconnectionManager.mockReturnValue({
        clearReconnection: jest.fn(),
      });
      require('~/config').getMCPManager.mockReturnValue({
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest.fn().mockResolvedValue([]),
        }),
      });
      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({ code: 'auth-code', state: flowId });

      expect(MCPOAuthHandler.completeOAuthFlow).toHaveBeenCalledWith(
        flowId,
        'auth-code',
        mockFlowManager,
        { 'X-Registry-Header': 'from-registry' },
      );
      expect(mockRegistryInstance.getServerConfig).toHaveBeenCalledWith(
        'test-server',
        'test-user-id',
        undefined,
      );
    });

    it('should redirect to error page when callback processing fails', async () => {
      MCPOAuthHandler.getFlowState.mockRejectedValue(new Error('Callback error'));
      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=callback_failed`);
    });

    it('should handle system-level OAuth completion', async () => {
      // mockRegistryInstance is defined at the top of the file
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'system',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith(flowId, 'mcp_get_tokens');
    });

    it('should handle reconnection failure after OAuth', async () => {
      // mockRegistryInstance is defined at the top of the file
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn().mockRejectedValue(new Error('Reconnection failed')),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);
      expect(MCPTokenStorage.storeTokens).toHaveBeenCalled();
      expect(mockFlowManager.deleteFlow).toHaveBeenCalledWith(flowId, 'mcp_get_tokens');
    });

    it('should redirect to error page if token storage fails', async () => {
      // mockRegistryInstance is defined at the top of the file
      const mockFlowManager = {
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const mockFlowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123' },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      MCPOAuthHandler.getFlowState.mockResolvedValue(mockFlowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockRejectedValue(new Error('store failed'));
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn(),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/error?error=callback_failed`);
      expect(mockMcpManager.getUserConnection).not.toHaveBeenCalled();
    });

    it('should use original flow state credentials when storing tokens', async () => {
      // mockRegistryInstance is defined at the top of the file
      const mockFlowManager = {
        getFlowState: jest.fn(),
        completeFlow: jest.fn().mockResolvedValue(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      const clientInfo = {
        client_id: 'client123',
        client_secret: 'client_secret',
      };
      const flowState = {
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { toolFlowId: 'tool-flow-123', serverUrl: 'http://example.com' },
        clientInfo: clientInfo,
        codeVerifier: 'test-verifier',
        status: 'PENDING',
      };
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      // First call checks idempotency (status PENDING = not completed)
      // Second call retrieves flow state for processing
      mockFlowManager.getFlowState
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce(flowState);

      MCPOAuthHandler.getFlowState.mockResolvedValue(flowState);
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([]),
      };
      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getOAuthReconnectionManager = jest.fn().mockReturnValue({
        clearReconnection: jest.fn(),
      });

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);

      expect(MCPTokenStorage.storeTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          serverName: 'test-server',
          tokens: mockTokens,
          clientInfo: clientInfo,
          metadata: flowState.metadata,
        }),
      );
    });

    it('should prevent duplicate token exchange with idempotency check', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn(),
      };

      // Flow is already completed
      mockFlowManager.getFlowState.mockResolvedValue({
        status: 'COMPLETED',
        serverName: 'test-server',
        userId: 'test-user-id',
      });

      MCPOAuthHandler.getFlowState.mockResolvedValue({
        status: 'COMPLETED',
        serverName: 'test-server',
        userId: 'test-user-id',
      });

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback')
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .query({
          code: 'test-auth-code',
          state: flowId,
        });
      const basePath = getBasePath();

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${basePath}/oauth/success?serverName=test-server`);

      expect(MCPOAuthHandler.completeOAuthFlow).not.toHaveBeenCalled();
      expect(MCPTokenStorage.storeTokens).not.toHaveBeenCalled();
    });
  });

  describe('GET /oauth/tokens/:flowId', () => {
    const { getLogStores } = require('~/cache');

    it('should return tokens for completed flow', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          status: 'COMPLETED',
          result: {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
          },
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/tokens/test-user-id:flow-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        tokens: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        },
      });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).get('/api/mcp/oauth/tokens/test-flow-id');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });

    it('should return 403 when user tries to access flow they do not own', async () => {
      const response = await request(app).get('/api/mcp/oauth/tokens/other-user-id:flow-123');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when flow is not found', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue(null),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get(
        '/api/mcp/oauth/tokens/test-user-id:non-existent-flow',
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Flow not found' });
    });

    it('should return 400 when flow is not completed', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          status: 'PENDING',
          result: null,
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/tokens/test-user-id:pending-flow');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Flow not completed' });
    });

    it('should return 500 when token retrieval throws an unexpected error', async () => {
      getLogStores.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app).get('/api/mcp/oauth/tokens/test-user-id:error-flow');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get tokens' });
    });
  });

  describe('GET /oauth/status/:flowId', () => {
    const { getLogStores } = require('~/cache');

    it('should return flow status when flow exists', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          status: 'PENDING',
          error: null,
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/status/test-user-id:test-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'PENDING',
        completed: false,
        failed: false,
        error: null,
      });
    });

    it('should return 403 when flowId does not match authenticated user', async () => {
      const response = await request(app).get('/api/mcp/oauth/status/other-user-id:test-server');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when flow is not found', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue(null),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/status/test-user-id:non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Flow not found' });
    });

    it('should return 500 when status check fails', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/status/test-user-id:error-server');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get flow status' });
    });
  });

  describe('POST /oauth/cancel/:serverName', () => {
    const { MCPOAuthHandler } = require('@librechat/api');
    const { getLogStores } = require('~/cache');

    it('should cancel OAuth flow successfully', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          status: 'PENDING',
        }),
        failFlow: jest.fn().mockResolvedValue(),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-user-id:test-server');

      const response = await request(app).post('/api/mcp/oauth/cancel/test-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'OAuth flow for test-server cancelled successfully',
      });

      expect(mockFlowManager.failFlow).toHaveBeenCalledWith(
        'test-user-id:test-server',
        'mcp_oauth',
        'User cancelled OAuth flow',
      );
    });

    it('should return success message when no active flow exists', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue(null),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-user-id:test-server');

      const response = await request(app).post('/api/mcp/oauth/cancel/test-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'No active OAuth flow to cancel',
      });
    });

    it('should return 500 when cancellation fails', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        failFlow: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      MCPOAuthHandler.generateFlowId.mockReturnValue('test-user-id:test-server');

      const response = await request(app).post('/api/mcp/oauth/cancel/test-server');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to cancel OAuth flow' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).post('/api/mcp/oauth/cancel/test-server');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });
  });

  describe('POST /:serverName/reinitialize', () => {
    // mockRegistryInstance is defined at the top of the file

    it('should return 404 when server is not found in configuration', async () => {
      const mockMcpManager = {
        disconnectUserConnection: jest.fn().mockResolvedValue(),
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue(null);
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const response = await request(app).post('/api/mcp/non-existent-server/reinitialize');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "MCP server 'non-existent-server' not found in configuration",
      });
    });

    it('should handle OAuth requirement during reinitialize', async () => {
      const mockMcpManager = {
        disconnectUserConnection: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockImplementation(async ({ oauthStart }) => {
          if (oauthStart) {
            await oauthStart('https://oauth.example.com/auth');
          }
          throw new Error('OAuth flow initiated - return early');
        }),
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        customUserVars: {},
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});
      require('~/server/services/Tools/mcp').reinitMCPServer.mockResolvedValue({
        success: true,
        message: "MCP server 'oauth-server' ready for OAuth authentication",
        serverName: 'oauth-server',
        oauthRequired: true,
        oauthUrl: 'https://oauth.example.com/auth',
      });

      const response = await request(app).post('/api/mcp/oauth-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "MCP server 'oauth-server' ready for OAuth authentication",
        serverName: 'oauth-server',
        oauthRequired: true,
        oauthUrl: 'https://oauth.example.com/auth',
      });
    });

    it('should return 500 when reinitialize fails with non-OAuth error', async () => {
      const mockMcpManager = {
        disconnectUserConnection: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue({});
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});
      require('~/server/services/Tools/mcp').reinitMCPServer.mockResolvedValue(null);

      const response = await request(app).post('/api/mcp/error-server/reinitialize');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to reinitialize MCP server for user',
      });
    });

    it('should return 500 when unexpected error occurs', async () => {
      const mockMcpManager = {
        disconnectUserConnection: jest.fn(),
      };

      mockRegistryInstance.getServerConfig.mockImplementation(() => {
        throw new Error('Config loading failed');
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });

    it('should successfully reinitialize server and cache tools', async () => {
      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([
          { name: 'tool1', description: 'Test tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: 'Test tool 2', inputSchema: { type: 'object' } },
        ]),
      };

      const mockMcpManager = {
        disconnectUserConnection: jest.fn().mockResolvedValue(),
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        endpoint: 'http://test-server.com',
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      const { updateMCPServerTools } = require('~/server/services/Config/mcp');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();
      updateMCPServerTools.mockResolvedValue();

      require('~/server/services/Tools/mcp').reinitMCPServer.mockResolvedValue({
        success: true,
        message: "MCP server 'test-server' reinitialized successfully",
        serverName: 'test-server',
        oauthRequired: false,
        oauthUrl: null,
      });

      const response = await request(app).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "MCP server 'test-server' reinitialized successfully",
        serverName: 'test-server',
        oauthRequired: false,
        oauthUrl: null,
      });
      expect(mockMcpManager.disconnectUserConnection).toHaveBeenCalledWith(
        'test-user-id',
        'test-server',
      );
    });

    it('should handle server with custom user variables', async () => {
      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([]),
      };

      const mockMcpManager = {
        disconnectUserConnection: jest.fn().mockResolvedValue(),
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        endpoint: 'http://test-server.com',
        customUserVars: {
          API_KEY: 'some-env-var',
        },
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});
      require('@librechat/api').getUserMCPAuthMap.mockResolvedValue({
        'mcp:test-server': {
          API_KEY: 'api-key-value',
        },
      });
      require('~/models').findPluginAuthsByKeys.mockResolvedValue([
        { key: 'API_KEY', value: 'api-key-value' },
      ]);

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      const { updateMCPServerTools } = require('~/server/services/Config/mcp');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();
      updateMCPServerTools.mockResolvedValue();

      require('~/server/services/Tools/mcp').reinitMCPServer.mockResolvedValue({
        success: true,
        message: "MCP server 'test-server' reinitialized successfully",
        serverName: 'test-server',
        oauthRequired: false,
        oauthUrl: null,
      });

      const response = await request(app).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(require('@librechat/api').getUserMCPAuthMap).toHaveBeenCalledWith({
        userId: 'test-user-id',
        servers: ['test-server'],
        findPluginAuthsByKeys: require('~/models').findPluginAuthsByKeys,
      });
    });
  });

  describe('GET /connection/status', () => {
    const { getMCPSetupData, getServerConnectionStatus } = require('~/server/services/MCP');

    it('should return connection status for all servers', async () => {
      const mockMcpConfig = {
        server1: { endpoint: 'http://server1.com' },
        server2: { endpoint: 'http://server2.com' },
      };

      getMCPSetupData.mockResolvedValue({
        mcpConfig: mockMcpConfig,
        appConnections: {},
        userConnections: {},
        oauthServers: [],
      });

      getServerConnectionStatus
        .mockResolvedValueOnce({
          connectionState: 'connected',
          requiresOAuth: false,
        })
        .mockResolvedValueOnce({
          connectionState: 'disconnected',
          requiresOAuth: true,
        });

      const response = await request(app).get('/api/mcp/connection/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        connectionStatus: {
          server1: {
            connectionState: 'connected',
            requiresOAuth: false,
          },
          server2: {
            connectionState: 'disconnected',
            requiresOAuth: true,
          },
        },
      });

      expect(getMCPSetupData).toHaveBeenCalledWith('test-user-id', expect.any(Object));
      expect(getServerConnectionStatus).toHaveBeenCalledTimes(2);
    });

    it('should return 500 when connection status check fails', async () => {
      getMCPSetupData.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/mcp/connection/status');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get connection status' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).get('/api/mcp/connection/status');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });
  });

  describe('GET /connection/status/:serverName', () => {
    const { getMCPSetupData, getServerConnectionStatus } = require('~/server/services/MCP');

    it('should return connection status for OAuth-required server', async () => {
      const mockMcpConfig = {
        'oauth-server': { endpoint: 'http://oauth-server.com' },
      };

      getMCPSetupData.mockResolvedValue({
        mcpConfig: mockMcpConfig,
        appConnections: {},
        userConnections: {},
        oauthServers: [],
      });

      getServerConnectionStatus.mockResolvedValue({
        connectionState: 'requires_auth',
        requiresOAuth: true,
      });

      const response = await request(app).get('/api/mcp/connection/status/oauth-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        serverName: 'oauth-server',
        connectionStatus: 'requires_auth',
        requiresOAuth: true,
      });
    });

    it('should return 404 when server is not found in configuration', async () => {
      getMCPSetupData.mockResolvedValue({
        mcpConfig: {
          'other-server': { endpoint: 'http://other-server.com' },
        },
        appConnections: {},
        userConnections: {},
        oauthServers: [],
      });

      const response = await request(app).get('/api/mcp/connection/status/non-existent-server');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "MCP server 'non-existent-server' not found in configuration",
      });
    });

    it('should return 500 when connection status check fails', async () => {
      getMCPSetupData.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/mcp/connection/status/test-server');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get connection status' });
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).get('/api/mcp/connection/status/test-server');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });
  });

  describe('GET /:serverName/auth-values', () => {
    const { getUserPluginAuthValue } = require('~/server/services/PluginService');
    // mockRegistryInstance is defined at the top of the file

    it('should return auth value flags for server', async () => {
      const mockMcpManager = {};

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        customUserVars: {
          API_KEY: 'some-env-var',
          SECRET_TOKEN: 'another-env-var',
        },
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      getUserPluginAuthValue.mockResolvedValueOnce('some-api-key-value').mockResolvedValueOnce('');

      const response = await request(app).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        serverName: 'test-server',
        authValueFlags: {
          API_KEY: true,
          SECRET_TOKEN: false,
        },
      });

      expect(getUserPluginAuthValue).toHaveBeenCalledTimes(2);
    });

    it('should return 404 when server is not found in configuration', async () => {
      const mockMcpManager = {};

      mockRegistryInstance.getServerConfig.mockResolvedValue(null);
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app).get('/api/mcp/non-existent-server/auth-values');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "MCP server 'non-existent-server' not found in configuration",
      });
    });

    it('should handle errors when checking auth values', async () => {
      const mockMcpManager = {};

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        customUserVars: {
          API_KEY: 'some-env-var',
        },
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      getUserPluginAuthValue.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        serverName: 'test-server',
        authValueFlags: {
          API_KEY: false,
        },
      });
    });

    it('should return 500 when auth values check throws unexpected error', async () => {
      const mockMcpManager = {};

      mockRegistryInstance.getServerConfig.mockImplementation(() => {
        throw new Error('Config loading failed');
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to check auth value flags' });
    });

    it('should handle customUserVars that is not an object', async () => {
      const mockMcpManager = {};

      mockRegistryInstance.getServerConfig.mockResolvedValue({
        customUserVars: 'not-an-object',
      });
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        serverName: 'test-server',
        authValueFlags: {},
      });
    });

    it('should return 401 when user is not authenticated in auth-values endpoint', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use('/api/mcp', mcpRouter);

      const response = await request(appWithoutAuth).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'User not authenticated' });
    });
  });

  describe('GET /:serverName/oauth/callback - Edge Cases', () => {
    it('should handle OAuth callback without toolFlowId (falsy toolFlowId)', async () => {
      const { MCPOAuthHandler, MCPTokenStorage } = require('@librechat/api');
      const mockTokens = {
        access_token: 'edge-access-token',
        refresh_token: 'edge-refresh-token',
      };
      MCPOAuthHandler.getFlowState = jest.fn().mockResolvedValue({
        id: 'test-user-id:test-server',
        userId: 'test-user-id',
        metadata: {
          serverUrl: 'https://example.com',
          oauth: {},
          // No toolFlowId property
        },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      });
      MCPOAuthHandler.completeOAuthFlow = jest.fn().mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});

      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
        completeFlow: jest.fn(),
        deleteFlow: jest.fn().mockResolvedValue(true),
      };
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest.fn().mockResolvedValue([]),
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get(`/api/mcp/test-server/oauth/callback?code=test-code&state=${flowId}`)
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .expect(302);

      const basePath = getBasePath();

      expect(mockFlowManager.completeFlow).not.toHaveBeenCalled();
      expect(response.headers.location).toContain(`${basePath}/oauth/success`);
    });

    it('should handle null cached tools in OAuth callback (triggers || {} fallback)', async () => {
      const { getCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue(null);
      const { MCPOAuthHandler, MCPTokenStorage } = require('@librechat/api');
      const mockTokens = {
        access_token: 'edge-access-token',
        refresh_token: 'edge-refresh-token',
      };

      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          id: 'test-user-id:test-server',
          userId: 'test-user-id',
          metadata: { serverUrl: 'https://example.com', oauth: {} },
          clientInfo: {},
          codeVerifier: 'test-verifier',
        }),
        completeFlow: jest.fn(),
      };
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);
      MCPOAuthHandler.getFlowState.mockResolvedValue({
        serverName: 'test-server',
        userId: 'test-user-id',
        metadata: { serverUrl: 'https://example.com', oauth: {} },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      });
      MCPOAuthHandler.completeOAuthFlow.mockResolvedValue(mockTokens);
      MCPTokenStorage.storeTokens.mockResolvedValue();
      mockRegistryInstance.getServerConfig.mockResolvedValue({});

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest
            .fn()
            .mockResolvedValue([{ name: 'test-tool', description: 'Test tool' }]),
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const flowId = 'test-user-id:test-server';
      const csrfToken = generateTestCsrfToken(flowId);

      const response = await request(app)
        .get(`/api/mcp/test-server/oauth/callback?code=test-code&state=${flowId}`)
        .set('Cookie', [`oauth_csrf=${csrfToken}`])
        .expect(302);

      const basePath = getBasePath();

      expect(response.headers.location).toContain(`${basePath}/oauth/success`);
    });
  });

  describe('GET /servers', () => {
    // mockRegistryInstance is defined at the top of the file

    it('should return all server configs for authenticated user', async () => {
      const mockServerConfigs = {
        'server-1': {
          type: 'sse',
          url: 'http://server1.com/sse',
          title: 'Server 1',
        },
        'server-2': {
          type: 'sse',
          url: 'http://server2.com/sse',
          title: 'Server 2',
        },
      };

      mockResolveAllMcpConfigs.mockResolvedValue(mockServerConfigs);

      const response = await request(app).get('/api/mcp/servers');

      expect(response.status).toBe(200);
      expect(response.body['server-1']).toMatchObject({
        type: 'sse',
        url: 'http://server1.com/sse',
        title: 'Server 1',
      });
      expect(response.body['server-2']).toMatchObject({
        type: 'sse',
        url: 'http://server2.com/sse',
        title: 'Server 2',
      });
      expect(response.body['server-1'].headers).toBeUndefined();
      expect(response.body['server-2'].headers).toBeUndefined();
      expect(mockResolveAllMcpConfigs).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ id: 'test-user-id' }),
      );
    });

    it('should return empty object when no servers are configured', async () => {
      mockResolveAllMcpConfigs.mockResolvedValue({});

      const response = await request(app).get('/api/mcp/servers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('should return 401 when user is not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        req.user = null;
        next();
      });
      unauthApp.use('/api/mcp', mcpRouter);

      const response = await request(unauthApp).get('/api/mcp/servers');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: 'Unauthorized' });
    });

    it('should return 500 when server config retrieval fails', async () => {
      mockResolveAllMcpConfigs.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/mcp/servers');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Database error' });
    });
  });

  describe('POST /servers', () => {
    it('should create MCP server with valid SSE config', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test SSE Server',
        description: 'A test SSE server',
      };

      mockRegistryInstance.addServer.mockResolvedValue({
        serverName: 'test-sse-server',
        config: validConfig,
      });

      const response = await request(app).post('/api/mcp/servers').send({ config: validConfig });

      expect(response.status).toBe(201);
      expect(response.body.serverName).toBe('test-sse-server');
      expect(response.body.type).toBe('sse');
      expect(response.body.url).toBe('https://mcp-server.example.com/sse');
      expect(response.body.title).toBe('Test SSE Server');
      expect(mockRegistryInstance.addServer).toHaveBeenCalledWith(
        'temp_server_name',
        expect.objectContaining({
          type: 'sse',
          url: 'https://mcp-server.example.com/sse',
        }),
        'DB',
        'test-user-id',
      );
    });

    it('should reject stdio config for security reasons', async () => {
      const stdioConfig = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        title: 'Test Stdio Server',
      };

      const response = await request(app).post('/api/mcp/servers').send({ config: stdioConfig });

      // Stdio transport is not allowed via API - only admins can configure it via YAML
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
    });

    it('should return 400 for invalid configuration', async () => {
      const invalidConfig = {
        type: 'sse',
        // Missing required 'url' field
        title: 'Invalid Server',
      };

      const response = await request(app).post('/api/mcp/servers').send({ config: invalidConfig });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(response.body.errors).toBeDefined();
    });

    it('should return 400 for SSE config with invalid URL protocol', async () => {
      const invalidConfig = {
        type: 'sse',
        url: 'ws://invalid-protocol.example.com/sse',
        title: 'Invalid Protocol Server',
      };

      const response = await request(app).post('/api/mcp/servers').send({ config: invalidConfig });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
    });

    it('should reject SSE URL containing env variable references', async () => {
      const response = await request(app)
        .post('/api/mcp/servers')
        .send({
          config: {
            type: 'sse',
            url: 'http://attacker.com/?secret=${JWT_SECRET}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.addServer).not.toHaveBeenCalled();
    });

    it('should reject streamable-http URL containing env variable references', async () => {
      const response = await request(app)
        .post('/api/mcp/servers')
        .send({
          config: {
            type: 'streamable-http',
            url: 'http://attacker.com/?key=${CREDS_KEY}&iv=${CREDS_IV}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.addServer).not.toHaveBeenCalled();
    });

    it('should reject websocket URL containing env variable references', async () => {
      const response = await request(app)
        .post('/api/mcp/servers')
        .send({
          config: {
            type: 'websocket',
            url: 'ws://attacker.com/?secret=${MONGO_URI}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.addServer).not.toHaveBeenCalled();
    });

    it('should redact secrets from create response', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test Server',
      };

      mockRegistryInstance.addServer.mockResolvedValue({
        serverName: 'test-server',
        config: {
          ...validConfig,
          apiKey: { source: 'admin', authorization_type: 'bearer', key: 'admin-secret-key' },
          oauth: { client_id: 'cid', client_secret: 'admin-oauth-secret' },
          headers: { Authorization: 'Bearer leaked-token' },
        },
      });

      const response = await request(app).post('/api/mcp/servers').send({ config: validConfig });

      expect(response.status).toBe(201);
      expect(response.body.apiKey?.key).toBeUndefined();
      expect(response.body.oauth?.client_secret).toBeUndefined();
      expect(response.body.headers).toBeUndefined();
      expect(response.body.apiKey?.source).toBe('admin');
      expect(response.body.oauth?.client_id).toBe('cid');
    });

    it('should return 500 when registry throws error', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test Server',
      };

      mockRegistryInstance.addServer.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).post('/api/mcp/servers').send({ config: validConfig });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Database connection failed' });
    });
  });

  describe('GET /servers/:serverName', () => {
    it('should return server config when found', async () => {
      const mockConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test Server',
      };

      mockRegistryInstance.getServerConfig.mockResolvedValue(mockConfig);

      const response = await request(app).get('/api/mcp/servers/test-server');

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('sse');
      expect(response.body.url).toBe('https://mcp-server.example.com/sse');
      expect(response.body.title).toBe('Test Server');
      expect(mockRegistryInstance.getServerConfig).toHaveBeenCalledWith(
        'test-server',
        'test-user-id',
        {},
      );
    });

    it('should return 404 when server not found', async () => {
      mockRegistryInstance.getServerConfig.mockResolvedValue(undefined);

      const response = await request(app).get('/api/mcp/servers/non-existent-server');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'MCP server not found' });
    });

    it('should redact secrets from get response', async () => {
      mockRegistryInstance.getServerConfig.mockResolvedValue({
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Secret Server',
        apiKey: { source: 'admin', authorization_type: 'bearer', key: 'decrypted-admin-key' },
        oauth: { client_id: 'cid', client_secret: 'decrypted-oauth-secret' },
        headers: { Authorization: 'Bearer internal-token' },
        oauth_headers: { 'X-OAuth': 'secret-value' },
      });

      const response = await request(app).get('/api/mcp/servers/secret-server');

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Secret Server');
      expect(response.body.apiKey?.key).toBeUndefined();
      expect(response.body.apiKey?.source).toBe('admin');
      expect(response.body.oauth?.client_secret).toBeUndefined();
      expect(response.body.oauth?.client_id).toBe('cid');
      expect(response.body.headers).toBeUndefined();
      expect(response.body.oauth_headers).toBeUndefined();
    });

    it('should return 500 when registry throws error', async () => {
      mockRegistryInstance.getServerConfig.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/mcp/servers/error-server');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Database error' });
    });
  });

  describe('PATCH /servers/:serverName', () => {
    it('should update server with valid config', async () => {
      const updatedConfig = {
        type: 'sse',
        url: 'https://updated-mcp-server.example.com/sse',
        title: 'Updated Server',
        description: 'Updated description',
      };

      mockRegistryInstance.updateServer.mockResolvedValue(updatedConfig);

      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({ config: updatedConfig });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('sse');
      expect(response.body.url).toBe('https://updated-mcp-server.example.com/sse');
      expect(response.body.title).toBe('Updated Server');
      expect(mockRegistryInstance.updateServer).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({
          type: 'sse',
          url: 'https://updated-mcp-server.example.com/sse',
        }),
        'DB',
        'test-user-id',
      );
    });

    it('should redact secrets from update response', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Updated Server',
      };

      mockRegistryInstance.updateServer.mockResolvedValue({
        ...validConfig,
        apiKey: { source: 'admin', authorization_type: 'bearer', key: 'preserved-admin-key' },
        oauth: { client_id: 'cid', client_secret: 'preserved-oauth-secret' },
        headers: { Authorization: 'Bearer internal-token' },
        env: { DATABASE_URL: 'postgres://admin:pass@localhost/db' },
      });

      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({ config: validConfig });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Server');
      expect(response.body.apiKey?.key).toBeUndefined();
      expect(response.body.apiKey?.source).toBe('admin');
      expect(response.body.oauth?.client_secret).toBeUndefined();
      expect(response.body.oauth?.client_id).toBe('cid');
      expect(response.body.headers).toBeUndefined();
      expect(response.body.env).toBeUndefined();
    });

    it('should return 400 for invalid configuration', async () => {
      const invalidConfig = {
        type: 'sse',
        // Missing required 'url' field
        title: 'Invalid Update',
      };

      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({ config: invalidConfig });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(response.body.errors).toBeDefined();
    });

    it('should reject SSE URL containing env variable references', async () => {
      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({
          config: {
            type: 'sse',
            url: 'http://attacker.com/?secret=${JWT_SECRET}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.updateServer).not.toHaveBeenCalled();
    });

    it('should reject streamable-http URL containing env variable references', async () => {
      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({
          config: {
            type: 'streamable-http',
            url: 'http://attacker.com/?key=${CREDS_KEY}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.updateServer).not.toHaveBeenCalled();
    });

    it('should reject websocket URL containing env variable references', async () => {
      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({
          config: {
            type: 'websocket',
            url: 'ws://attacker.com/?secret=${MONGO_URI}',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid configuration');
      expect(mockRegistryInstance.updateServer).not.toHaveBeenCalled();
    });

    it('should return 500 when registry throws error', async () => {
      const validConfig = {
        type: 'sse',
        url: 'https://mcp-server.example.com/sse',
        title: 'Test Server',
      };

      mockRegistryInstance.updateServer.mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .patch('/api/mcp/servers/test-server')
        .send({ config: validConfig });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Update failed' });
    });
  });

  describe('DELETE /servers/:serverName', () => {
    it('should delete server successfully', async () => {
      mockRegistryInstance.removeServer.mockResolvedValue(undefined);

      const response = await request(app).delete('/api/mcp/servers/test-server');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'MCP server deleted successfully' });
      expect(mockRegistryInstance.removeServer).toHaveBeenCalledWith(
        'test-server',
        'DB',
        'test-user-id',
      );
    });

    it('should return 500 when registry throws error', async () => {
      mockRegistryInstance.removeServer.mockRejectedValue(new Error('Deletion failed'));

      const response = await request(app).delete('/api/mcp/servers/error-server');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Deletion failed' });
    });
  });
});
