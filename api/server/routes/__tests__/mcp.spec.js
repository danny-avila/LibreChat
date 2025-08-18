const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {
    initiateOAuthFlow: jest.fn(),
    getFlowState: jest.fn(),
    completeOAuthFlow: jest.fn(),
    generateFlowId: jest.fn(),
  },
}));

jest.mock('@librechat/data-schemas', () => ({
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
}));

jest.mock('~/models', () => ({
  findToken: jest.fn(),
  updateToken: jest.fn(),
  createToken: jest.fn(),
  deleteTokens: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

jest.mock('~/server/services/MCP', () => ({
  getMCPSetupData: jest.fn(),
  getServerConnectionStatus: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  getUserPluginAuthValue: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
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

      MCPOAuthHandler.initiateOAuthFlow.mockResolvedValue({
        authorizationUrl: 'https://oauth.example.com/auth',
        flowId: 'test-flow-id',
      });

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://oauth.example.com/auth');
      expect(MCPOAuthHandler.initiateOAuthFlow).toHaveBeenCalledWith(
        'test-server',
        'https://test-server.com',
        'test-user-id',
        { clientId: 'test-client-id' },
      );
    });

    it('should return 403 when userId does not match authenticated user', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'different-user-id',
        flowId: 'test-flow-id',
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
        flowId: 'test-flow-id',
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
        flowId: 'test-flow-id',
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to initiate OAuth' });
    });

    it('should return 400 when flow state metadata is null', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          id: 'test-flow-id',
          metadata: null,
        }),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/initiate').query({
        userId: 'test-user-id',
        flowId: 'test-flow-id',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid flow state' });
    });
  });

  describe('GET /:serverName/oauth/callback', () => {
    const { MCPOAuthHandler } = require('@librechat/api');
    const { getLogStores } = require('~/cache');

    it('should redirect to error page when OAuth error is received', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        error: 'access_denied',
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/error?error=access_denied');
    });

    it('should redirect to error page when code is missing', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/error?error=missing_code');
    });

    it('should redirect to error page when state is missing', async () => {
      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/error?error=missing_state');
    });

    it('should redirect to error page when flow state is not found', async () => {
      MCPOAuthHandler.getFlowState.mockResolvedValue(null);

      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'invalid-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/error?error=invalid_state');
    });

    it('should handle OAuth callback successfully', async () => {
      const mockFlowManager = {
        completeFlow: jest.fn().mockResolvedValue(),
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

      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/success?serverName=test-server');
      expect(MCPOAuthHandler.completeOAuthFlow).toHaveBeenCalledWith(
        'test-flow-id',
        'test-auth-code',
        mockFlowManager,
      );
      expect(mockFlowManager.completeFlow).toHaveBeenCalledWith(
        'tool-flow-123',
        'mcp_oauth',
        mockTokens,
      );
    });

    it('should redirect to error page when callback processing fails', async () => {
      MCPOAuthHandler.getFlowState.mockRejectedValue(new Error('Callback error'));

      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/error?error=callback_failed');
    });

    it('should handle system-level OAuth completion', async () => {
      const mockFlowManager = {
        completeFlow: jest.fn().mockResolvedValue(),
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
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/success?serverName=test-server');
    });

    it('should handle reconnection failure after OAuth', async () => {
      const mockFlowManager = {
        completeFlow: jest.fn().mockResolvedValue(),
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
      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn().mockRejectedValue(new Error('Reconnection failed')),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();

      const response = await request(app).get('/api/mcp/test-server/oauth/callback').query({
        code: 'test-auth-code',
        state: 'test-flow-id',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/oauth/success?serverName=test-server');
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
      const mockFlowManager = {
        getFlowState: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

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

      const response = await request(app).get('/api/mcp/oauth/status/test-flow-id');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'PENDING',
        completed: false,
        failed: false,
        error: null,
      });
    });

    it('should return 404 when flow is not found', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue(null),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/status/non-existent-flow');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Flow not found' });
    });

    it('should return 500 when status check fails', async () => {
      const mockFlowManager = {
        getFlowState: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      getLogStores.mockReturnValue({});
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const response = await request(app).get('/api/mcp/oauth/status/error-flow-id');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to get flow status' });
    });
  });

  describe('POST /oauth/cancel/:serverName', () => {
    const { getLogStores } = require('~/cache');
    const { MCPOAuthHandler } = require('@librechat/api');

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
    const { loadCustomConfig } = require('~/server/services/Config');
    const { getUserPluginAuthValue } = require('~/server/services/PluginService');

    it('should return 404 when server is not found in configuration', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'other-server': {},
        },
      });

      const response = await request(app).post('/api/mcp/non-existent-server/reinitialize');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "MCP server 'non-existent-server' not found in configuration",
      });
    });

    it('should handle OAuth requirement during reinitialize', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'oauth-server': {
            customUserVars: {},
          },
        },
      });

      const mockMcpManager = {
        disconnectServer: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockImplementation(async ({ oauthStart }) => {
          if (oauthStart) {
            await oauthStart('https://oauth.example.com/auth');
          }
          throw new Error('OAuth flow initiated - return early');
        }),
      };

      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const response = await request(app).post('/api/mcp/oauth-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: 'https://oauth.example.com/auth',
        message: "MCP server 'oauth-server' ready for OAuth authentication",
        serverName: 'oauth-server',
        oauthRequired: true,
        oauthUrl: 'https://oauth.example.com/auth',
      });
    });

    it('should return 500 when reinitialize fails with non-OAuth error', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'error-server': {},
        },
      });

      const mockMcpManager = {
        disconnectServer: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };

      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const response = await request(app).post('/api/mcp/error-server/reinitialize');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to reinitialize MCP server for user',
      });
    });

    it('should return 500 when unexpected error occurs', async () => {
      loadCustomConfig.mockRejectedValue(new Error('Config loading failed'));

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

    it('should handle errors when fetching custom user variables', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': {
            customUserVars: {
              API_KEY: 'test-key-var',
              SECRET_TOKEN: 'test-secret-var',
            },
          },
        },
      });

      getUserPluginAuthValue
        .mockResolvedValueOnce('test-api-key-value')
        .mockRejectedValueOnce(new Error('Database error'));

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([]),
      };

      const mockMcpManager = {
        disconnectServer: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
      };

      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue({});
      setCachedTools.mockResolvedValue();

      const response = await request(app).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return failure message when reinitialize completely fails', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': {},
        },
      });

      const mockMcpManager = {
        disconnectServer: jest.fn().mockResolvedValue(),
        mcpConfigs: {},
        getUserConnection: jest.fn().mockResolvedValue(null),
      };

      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);
      require('~/config').getFlowStateManager.mockReturnValue({});
      require('~/cache').getLogStores.mockReturnValue({});

      const { getCachedTools, setCachedTools } = require('~/server/services/Config');
      const { Constants } = require('librechat-data-provider');
      getCachedTools.mockResolvedValue({
        [`existing-tool${Constants.mcp_delimiter}test-server`]: { type: 'function' },
      });
      setCachedTools.mockResolvedValue();

      const response = await request(app).post('/api/mcp/test-server/reinitialize');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe("Failed to reinitialize MCP server 'test-server'");
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

      expect(getMCPSetupData).toHaveBeenCalledWith('test-user-id');
      expect(getServerConnectionStatus).toHaveBeenCalledTimes(2);
    });

    it('should return 404 when MCP config is not found', async () => {
      getMCPSetupData.mockRejectedValue(new Error('MCP config not found'));

      const response = await request(app).get('/api/mcp/connection/status');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'MCP config not found' });
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

    it('should return 404 when MCP config is not found', async () => {
      getMCPSetupData.mockRejectedValue(new Error('MCP config not found'));

      const response = await request(app).get('/api/mcp/connection/status/test-server');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'MCP config not found' });
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
    const { loadCustomConfig } = require('~/server/services/Config');
    const { getUserPluginAuthValue } = require('~/server/services/PluginService');

    it('should return auth value flags for server', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': {
            customUserVars: {
              API_KEY: 'some-env-var',
              SECRET_TOKEN: 'another-env-var',
            },
          },
        },
      });

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
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'other-server': {},
        },
      });

      const response = await request(app).get('/api/mcp/non-existent-server/auth-values');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: "MCP server 'non-existent-server' not found in configuration",
      });
    });

    it('should handle errors when checking auth values', async () => {
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': {
            customUserVars: {
              API_KEY: 'some-env-var',
            },
          },
        },
      });

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
      loadCustomConfig.mockRejectedValue(new Error('Config loading failed'));

      const response = await request(app).get('/api/mcp/test-server/auth-values');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to check auth value flags' });
    });

    it('should handle customUserVars that is not an object', async () => {
      const { loadCustomConfig } = require('~/server/services/Config');
      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': {
            customUserVars: 'not-an-object',
          },
        },
      });

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

  describe('POST /:serverName/reinitialize - Tool Deletion Coverage', () => {
    it('should handle null cached tools during reinitialize (triggers || {} fallback)', async () => {
      const { loadCustomConfig, getCachedTools } = require('~/server/services/Config');

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([{ name: 'new-tool', description: 'A new tool' }]),
      };

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
        disconnectServer: jest.fn(),
        initializeServer: jest.fn(),
        mcpConfigs: {},
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': { env: { API_KEY: 'test-key' } },
        },
      });

      getCachedTools.mockResolvedValue(null);

      const response = await request(app).post('/api/mcp/test-server/reinitialize').expect(200);

      expect(response.body).toEqual({
        message: "MCP server 'test-server' reinitialized successfully",
        success: true,
        oauthRequired: false,
        oauthUrl: null,
        serverName: 'test-server',
      });
    });

    it('should delete existing cached tools during successful reinitialize', async () => {
      const {
        loadCustomConfig,
        getCachedTools,
        setCachedTools,
      } = require('~/server/services/Config');

      const mockUserConnection = {
        fetchTools: jest.fn().mockResolvedValue([{ name: 'new-tool', description: 'A new tool' }]),
      };

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue(mockUserConnection),
        disconnectServer: jest.fn(),
        initializeServer: jest.fn(),
        mcpConfigs: {},
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      loadCustomConfig.mockResolvedValue({
        mcpServers: {
          'test-server': { env: { API_KEY: 'test-key' } },
        },
      });

      const existingTools = {
        'old-tool_mcp_test-server': { type: 'function' },
        'other-tool_mcp_other-server': { type: 'function' },
      };
      getCachedTools.mockResolvedValue(existingTools);

      const response = await request(app).post('/api/mcp/test-server/reinitialize').expect(200);

      expect(response.body).toEqual({
        message: "MCP server 'test-server' reinitialized successfully",
        success: true,
        oauthRequired: false,
        oauthUrl: null,
        serverName: 'test-server',
      });

      expect(setCachedTools).toHaveBeenCalledWith(
        expect.objectContaining({
          'new-tool_mcp_test-server': expect.any(Object),
          'other-tool_mcp_other-server': { type: 'function' },
        }),
        { userId: 'test-user-id' },
      );
      expect(setCachedTools).toHaveBeenCalledWith(
        expect.not.objectContaining({
          'old-tool_mcp_test-server': expect.anything(),
        }),
        { userId: 'test-user-id' },
      );
    });
  });

  describe('GET /:serverName/oauth/callback - Edge Cases', () => {
    it('should handle OAuth callback without toolFlowId (falsy toolFlowId)', async () => {
      const { MCPOAuthHandler } = require('@librechat/api');
      MCPOAuthHandler.getFlowState = jest.fn().mockResolvedValue({
        id: 'test-flow-id',
        userId: 'test-user-id',
        metadata: {
          serverUrl: 'https://example.com',
          oauth: {},
          // No toolFlowId property
        },
        clientInfo: {},
        codeVerifier: 'test-verifier',
      });

      const mockFlowManager = {
        completeFlow: jest.fn(),
      };
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest.fn().mockResolvedValue([]),
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback?code=test-code&state=test-flow-id')
        .expect(302);

      expect(mockFlowManager.completeFlow).not.toHaveBeenCalled();
      expect(response.headers.location).toContain('/oauth/success');
    });

    it('should handle null cached tools in OAuth callback (triggers || {} fallback)', async () => {
      const { getCachedTools } = require('~/server/services/Config');
      getCachedTools.mockResolvedValue(null);

      const mockFlowManager = {
        getFlowState: jest.fn().mockResolvedValue({
          id: 'test-flow-id',
          userId: 'test-user-id',
          metadata: { serverUrl: 'https://example.com', oauth: {} },
          clientInfo: {},
          codeVerifier: 'test-verifier',
        }),
        completeFlow: jest.fn(),
      };
      require('~/config').getFlowStateManager.mockReturnValue(mockFlowManager);

      const mockMcpManager = {
        getUserConnection: jest.fn().mockResolvedValue({
          fetchTools: jest
            .fn()
            .mockResolvedValue([{ name: 'test-tool', description: 'Test tool' }]),
        }),
      };
      require('~/config').getMCPManager.mockReturnValue(mockMcpManager);

      const response = await request(app)
        .get('/api/mcp/test-server/oauth/callback?code=test-code&state=test-flow-id')
        .expect(302);

      expect(response.headers.location).toContain('/oauth/success');
    });
  });
});
