const mockUpdateUserPlugins = jest.fn();
const mockFindToken = jest.fn();
const mockDeleteUserPluginAuth = jest.fn();
const mockGetAppConfig = jest.fn();
const mockInvalidateCachedTools = jest.fn();
const mockGetLogStores = jest.fn();
const mockGetMCPManager = jest.fn();
const mockGetFlowStateManager = jest.fn();
const mockGetMCPServersRegistry = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  webSearchKeys: [],
}));

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: { FLOWS: 'flows' },
  Constants: { mcp_delimiter: '_mcp_', mcp_prefix: 'mcp_' },
  FileSources: {},
}));

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {
    generateFlowId: jest.fn(() => 'user-1:test-server'),
    revokeOAuthToken: jest.fn(),
  },
  MCPTokenStorage: {
    getClientInfoAndMetadata: jest.fn(),
    getTokens: jest.fn(),
    deleteUserTokens: jest.fn().mockResolvedValue(undefined),
  },
  normalizeHttpError: jest.fn((error) => error),
  extractWebSearchEnvVars: jest.fn((params) => params.keys),
  needsRefresh: jest.fn(),
  getNewS3URL: jest.fn(),
}));

jest.mock('~/models', () => ({
  updateUserPlugins: (...args) => mockUpdateUserPlugins(...args),
  findToken: mockFindToken,
  deleteTokens: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: (...args) => mockDeleteUserPluginAuth(...args),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  verifyOTPOrBackupCode: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: (...args) => mockGetMCPManager(...args),
  getFlowStateManager: (...args) => mockGetFlowStateManager(...args),
  getMCPServersRegistry: (...args) => mockGetMCPServersRegistry(...args),
}));

jest.mock('~/server/services/Config/getCachedTools', () => ({
  invalidateCachedTools: (...args) => mockInvalidateCachedTools(...args),
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: (...args) => mockGetAppConfig(...args),
}));

jest.mock('~/cache', () => ({
  getLogStores: (...args) => mockGetLogStores(...args),
}));

const { logger } = require('@librechat/data-schemas');
const { MCPTokenStorage, MCPOAuthHandler } = require('@librechat/api');
const { updateUserPluginsController } = require('~/server/controllers/UserController');

function createResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest() {
  return {
    user: {
      id: 'user-1',
      _id: 'user-1',
      plugins: [],
      role: 'USER',
    },
    body: {
      pluginKey: 'mcp_test-server',
      action: 'uninstall',
      auth: {},
    },
  };
}

function setupMCPMocks() {
  const flowManager = {
    deleteFlow: jest.fn().mockResolvedValue(true),
  };
  const mcpManager = {
    disconnectUserConnection: jest.fn().mockResolvedValue(),
  };
  const registry = {
    getServerConfig: jest.fn().mockResolvedValue({
      url: 'https://example.com/mcp',
      oauth: {},
      oauth_headers: {},
    }),
    getOAuthServers: jest.fn().mockResolvedValue(new Set(['test-server'])),
    getAllowedDomains: jest.fn().mockReturnValue([]),
  };

  mockGetAppConfig.mockResolvedValue({});
  mockUpdateUserPlugins.mockResolvedValue();
  mockDeleteUserPluginAuth.mockResolvedValue();
  mockInvalidateCachedTools.mockResolvedValue();
  mockGetLogStores.mockReturnValue({});
  mockGetFlowStateManager.mockReturnValue(flowManager);
  mockGetMCPManager.mockReturnValue(mcpManager);
  mockGetMCPServersRegistry.mockReturnValue(registry);

  return { flowManager, mcpManager, registry };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateUserPluginsController MCP OAuth cleanup', () => {
  it('clears stored OAuth token state when client metadata is missing', async () => {
    const { flowManager, mcpManager } = setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue(null);

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPTokenStorage.getClientInfoAndMetadata).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      findToken: mockFindToken,
    });
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(MCPOAuthHandler.revokeOAuthToken).not.toHaveBeenCalled();
    expect(mcpManager.disconnectUserConnection).toHaveBeenCalledWith('user-1', 'test-server');
  });

  it('still clears OAuth flow state when stored token deletion fails', async () => {
    const { flowManager } = setupMCPMocks();
    const cleanupError = new Error('DB down');
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue(null);
    MCPTokenStorage.deleteUserTokens.mockRejectedValueOnce(cleanupError);

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(logger.warn).toHaveBeenCalledWith(
      '[clearStoredMCPOAuthState] Failed to delete MCP OAuth tokens for test-server:',
      cleanupError,
    );
  });

  it('logs all flow cleanup failures without failing MCP OAuth cleanup', async () => {
    const { flowManager } = setupMCPMocks();
    const getTokensFlowError = new Error('get tokens flow cache down');
    const oauthFlowError = new Error('oauth flow cache down');
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue(null);
    flowManager.deleteFlow
      .mockRejectedValueOnce(getTokensFlowError)
      .mockRejectedValueOnce(oauthFlowError);

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(logger.warn).toHaveBeenCalledWith(
      '[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for test-server:',
      getTokensFlowError,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      '[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for test-server:',
      oauthFlowError,
    );
  });

  it('clears stored OAuth token state when client metadata cannot be loaded', async () => {
    const { flowManager } = setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockRejectedValue(new Error('invalid client info'));

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logger.warn).toHaveBeenCalledWith(
      '[maybeUninstallOAuthMCP] Unable to load OAuth client metadata for test-server; clearing local MCP OAuth state only.',
      expect.any(Error),
    );
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(MCPTokenStorage.getTokens).not.toHaveBeenCalled();
    expect(MCPOAuthHandler.revokeOAuthToken).not.toHaveBeenCalled();
  });

  it('clears stored OAuth token state when server config is missing', async () => {
    const { flowManager, registry } = setupMCPMocks();
    registry.getServerConfig.mockResolvedValue(undefined);

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(MCPTokenStorage.getClientInfoAndMetadata).not.toHaveBeenCalled();
    expect(MCPOAuthHandler.revokeOAuthToken).not.toHaveBeenCalled();
  });

  it('clears stored OAuth token state when server no longer requires OAuth', async () => {
    const { flowManager, registry } = setupMCPMocks();
    registry.getOAuthServers.mockResolvedValue(new Set());

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(MCPTokenStorage.getClientInfoAndMetadata).not.toHaveBeenCalled();
    expect(MCPOAuthHandler.revokeOAuthToken).not.toHaveBeenCalled();
  });

  it('clears stored OAuth token state when token loading fails before provider revocation', async () => {
    const { flowManager } = setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue({
      clientInfo: { client_id: 'client-1' },
      clientMetadata: {},
    });
    MCPTokenStorage.getTokens.mockRejectedValue(new Error('token lookup failed'));

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPTokenStorage.getTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      findToken: mockFindToken,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[maybeUninstallOAuthMCP] Unable to load OAuth tokens for test-server; clearing local token state.',
      expect.any(Error),
    );
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_get_tokens');
    expect(flowManager.deleteFlow).toHaveBeenCalledWith('user-1:test-server', 'mcp_oauth');
    expect(MCPOAuthHandler.revokeOAuthToken).not.toHaveBeenCalled();
  });

  it('revokes provider tokens before clearing local token state when token data is available', async () => {
    setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue({
      clientInfo: { client_id: 'client-1', client_secret: 'secret-1' },
      clientMetadata: { revocation_endpoint: 'https://example.com/revoke' },
    });
    MCPTokenStorage.getTokens.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    MCPOAuthHandler.revokeOAuthToken.mockResolvedValue();

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPTokenStorage.getTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      findToken: mockFindToken,
    });
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledWith(
      'test-server',
      'access-token',
      'access',
      {
        serverUrl: 'https://example.com/mcp',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        revocationEndpoint: 'https://example.com/revoke',
        revocationEndpointAuthMethodsSupported: undefined,
      },
      {},
      [],
    );
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledWith(
      'test-server',
      'refresh-token',
      'refresh',
      {
        serverUrl: 'https://example.com/mcp',
        clientId: 'client-1',
        clientSecret: 'secret-1',
        revocationEndpoint: 'https://example.com/revoke',
        revocationEndpointAuthMethodsSupported: undefined,
      },
      {},
      [],
    );
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
  });

  it('revokes only the access token when refresh token data is absent', async () => {
    setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue({
      clientInfo: { client_id: 'client-1', client_secret: 'secret-1' },
      clientMetadata: {},
    });
    MCPTokenStorage.getTokens.mockResolvedValue({
      access_token: 'access-token',
    });
    MCPOAuthHandler.revokeOAuthToken.mockResolvedValue();

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledTimes(1);
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledWith(
      'test-server',
      'access-token',
      'access',
      expect.objectContaining({ clientId: 'client-1' }),
      {},
      [],
    );
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
  });

  it('revokes only the refresh token when access token data is absent', async () => {
    setupMCPMocks();
    MCPTokenStorage.getClientInfoAndMetadata.mockResolvedValue({
      clientInfo: { client_id: 'client-1', client_secret: 'secret-1' },
      clientMetadata: {},
    });
    MCPTokenStorage.getTokens.mockResolvedValue({
      refresh_token: 'refresh-token',
    });
    MCPOAuthHandler.revokeOAuthToken.mockResolvedValue();

    const res = createResponse();
    await updateUserPluginsController(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledTimes(1);
    expect(MCPOAuthHandler.revokeOAuthToken).toHaveBeenCalledWith(
      'test-server',
      'refresh-token',
      'refresh',
      expect.objectContaining({ clientId: 'client-1' }),
      {},
      [],
    );
    expect(MCPTokenStorage.deleteUserTokens).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'test-server',
      deleteToken: expect.any(Function),
    });
  });
});
