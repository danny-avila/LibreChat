const mockGetTokens = jest.fn();
const mockDeleteUserTokens = jest.fn();
const mockGetClientInfoAndMetadata = jest.fn();
const mockRevokeOAuthToken = jest.fn();
const mockGetServerConfig = jest.fn();
const mockGetOAuthServers = jest.fn();
const mockGetAllowedDomains = jest.fn();
const mockGetAllowedAddresses = jest.fn();
const mockDeleteFlow = jest.fn();
const mockGetLogStores = jest.fn();
const mockFindToken = jest.fn();
const mockDeleteTokens = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError },
  webSearchKeys: [],
}));

jest.mock('@librechat/api', () => {
  return {
    MCPOAuthHandler: {
      revokeOAuthToken: (...args) => mockRevokeOAuthToken(...args),
      generateFlowId: (userId, serverName) => `${userId}:${serverName}`,
    },
    MCPTokenStorage: {
      getTokens: (...args) => mockGetTokens(...args),
      getClientInfoAndMetadata: (...args) => mockGetClientInfoAndMetadata(...args),
      deleteUserTokens: (...args) => mockDeleteUserTokens(...args),
    },
    normalizeHttpError: jest.fn(),
    extractWebSearchEnvVars: jest.fn(),
    needsRefresh: jest.fn(),
    getNewS3URL: jest.fn(),
  };
});

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: { FLOWS: 'flows' },
  Constants: { mcp_delimiter: '::', mcp_prefix: 'mcp_' },
  FileSources: {},
  ResourceType: {},
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(() => ({
    deleteFlow: (...args) => mockDeleteFlow(...args),
  })),
  getMCPServersRegistry: jest.fn(() => ({
    getServerConfig: (...args) => mockGetServerConfig(...args),
    getOAuthServers: (...args) => mockGetOAuthServers(...args),
    getAllowedDomains: (...args) => mockGetAllowedDomains(...args),
    getAllowedAddresses: (...args) => mockGetAllowedAddresses(...args),
  })),
}));

jest.mock('~/cache', () => ({
  getLogStores: (...args) => mockGetLogStores(...args),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn(),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  verifyOTPOrBackupCode: jest.fn(),
}));

jest.mock('~/server/services/AuthService', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock('~/server/services/Config/getCachedTools', () => ({
  invalidateCachedTools: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/models', () => ({
  findToken: (...args) => mockFindToken(...args),
  deleteTokens: (...args) => mockDeleteTokens(...args),
  updateUser: jest.fn(),
  deleteAllUserSessions: jest.fn(),
  deleteAllSharedLinks: jest.fn(),
  updateUserPlugins: jest.fn(),
  deleteUserById: jest.fn(),
  deleteMessages: jest.fn(),
  deletePresets: jest.fn(),
  deleteUserKey: jest.fn(),
  getUserById: jest.fn(),
  deleteConvos: jest.fn(),
  deleteFiles: jest.fn(),
  getFiles: jest.fn(),
  deleteToolCalls: jest.fn(),
  deleteUserAgents: jest.fn(),
  deleteUserPrompts: jest.fn(),
  deleteTransactions: jest.fn(),
  deleteBalances: jest.fn(),
  deleteAllAgentApiKeys: jest.fn(),
  deleteAssistants: jest.fn(),
  deleteConversationTags: jest.fn(),
  deleteAllUserMemories: jest.fn(),
  deleteActions: jest.fn(),
  removeUserFromAllGroups: jest.fn(),
  deleteAclEntries: jest.fn(),
  getSoleOwnedResourceIds: jest.fn().mockResolvedValue([]),
}));

const { maybeUninstallOAuthMCP } = require('~/server/controllers/UserController');

const userId = 'user-123';
const pluginKey = 'mcp_acme';
const serverName = 'acme';

const serverConfig = {
  url: 'https://acme.example.com',
  oauth: {
    revocation_endpoint: 'https://acme.example.com/revoke',
    revocation_endpoint_auth_methods_supported: ['client_secret_basic'],
  },
  oauth_headers: { 'X-Tenant': 'acme' },
};

const appConfig = {
  mcpServers: { acme: serverConfig },
};

const clientInfo = { client_id: 'cid', client_secret: 'csec' };
const clientMetadata = {};

function setupOAuthServerFound() {
  mockGetServerConfig.mockResolvedValue(serverConfig);
  mockGetOAuthServers.mockResolvedValue(new Set([serverName]));
  mockGetAllowedDomains.mockReturnValue(['https://acme.example.com']);
  mockGetAllowedAddresses.mockReturnValue(null);
  mockGetClientInfoAndMetadata.mockResolvedValue({ clientInfo, clientMetadata });
}

describe('maybeUninstallOAuthMCP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('is a no-op when pluginKey is not an MCP key', async () => {
    await maybeUninstallOAuthMCP(userId, 'plugin_google_calendar', appConfig);

    expect(mockGetServerConfig).not.toHaveBeenCalled();
    expect(mockGetTokens).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).not.toHaveBeenCalled();
    expect(mockDeleteFlow).not.toHaveBeenCalled();
  });

  test('clears stored state when the MCP server is not an OAuth server', async () => {
    mockGetServerConfig.mockResolvedValue(serverConfig);
    mockGetOAuthServers.mockResolvedValue(new Set(['other']));

    await maybeUninstallOAuthMCP(userId, pluginKey, appConfig);

    expect(mockGetClientInfoAndMetadata).not.toHaveBeenCalled();
    expect(mockGetTokens).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteUserTokens.mock.calls[0][0]).toMatchObject({ userId, serverName });
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
  });

  test('clears stored state when client info is missing', async () => {
    setupOAuthServerFound();
    mockGetClientInfoAndMetadata.mockResolvedValue(null);

    await maybeUninstallOAuthMCP(userId, pluginKey, appConfig);

    expect(mockGetTokens).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteUserTokens.mock.calls[0][0]).toMatchObject({ userId, serverName });
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
  });

  test('clears stored state when client info cannot be loaded', async () => {
    setupOAuthServerFound();
    mockGetClientInfoAndMetadata.mockRejectedValue(new Error('bad client data'));
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await maybeUninstallOAuthMCP(userId, pluginKey, appConfig);

    expect(mockGetTokens).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteUserTokens.mock.calls[0][0]).toMatchObject({ userId, serverName });
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      `[maybeUninstallOAuthMCP] Unable to load OAuth client metadata for ${serverName}; clearing local MCP OAuth state only.`,
      expect.any(Error),
    );
  });

  test('revokes both tokens and runs cleanup on happy path', async () => {
    setupOAuthServerFound();
    mockGetTokens.mockResolvedValue({
      access_token: 'access-abc',
      refresh_token: 'refresh-xyz',
    });
    mockRevokeOAuthToken.mockResolvedValue(undefined);
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await maybeUninstallOAuthMCP(userId, pluginKey, appConfig);

    expect(mockRevokeOAuthToken).toHaveBeenCalledTimes(2);
    expect(mockRevokeOAuthToken.mock.calls[0][1]).toBe('access-abc');
    expect(mockRevokeOAuthToken.mock.calls[0][2]).toBe('access');
    expect(mockRevokeOAuthToken.mock.calls[1][1]).toBe('refresh-xyz');
    expect(mockRevokeOAuthToken.mock.calls[1][2]).toBe('refresh');

    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteUserTokens.mock.calls[0][0]).toMatchObject({ userId, serverName });

    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
    expect(mockDeleteFlow.mock.calls[0][1]).toBe('mcp_get_tokens');
    expect(mockDeleteFlow.mock.calls[1][1]).toBe('mcp_oauth');
  });

  test('skips revocation but still runs cleanup when token retrieval fails', async () => {
    setupOAuthServerFound();
    mockGetTokens.mockRejectedValue(new Error('missing'));
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await expect(maybeUninstallOAuthMCP(userId, pluginKey, appConfig)).resolves.toBeUndefined();

    expect(mockRevokeOAuthToken).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      `[maybeUninstallOAuthMCP] Unable to load OAuth tokens for ${serverName}; clearing local token state.`,
      expect.any(Error),
    );
  });

  test('skips revocation, logs warn, and still runs cleanup on unexpected token-retrieval error', async () => {
    setupOAuthServerFound();
    mockGetTokens.mockRejectedValue(new Error('boom: unreachable'));
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await expect(maybeUninstallOAuthMCP(userId, pluginKey, appConfig)).resolves.toBeUndefined();

    expect(mockRevokeOAuthToken).not.toHaveBeenCalled();
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      `[maybeUninstallOAuthMCP] Unable to load OAuth tokens for ${serverName}; clearing local token state.`,
      expect.any(Error),
    );
  });

  test('continues cleanup when only one token type is present', async () => {
    setupOAuthServerFound();
    mockGetTokens.mockResolvedValue({ access_token: 'only-access' });
    mockRevokeOAuthToken.mockResolvedValue(undefined);
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await maybeUninstallOAuthMCP(userId, pluginKey, appConfig);

    expect(mockRevokeOAuthToken).toHaveBeenCalledTimes(1);
    expect(mockRevokeOAuthToken.mock.calls[0][2]).toBe('access');
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
  });

  test('still runs cleanup even when both revocation calls fail', async () => {
    setupOAuthServerFound();
    mockGetTokens.mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
    });
    mockRevokeOAuthToken.mockRejectedValue(new Error('network down'));
    mockDeleteUserTokens.mockResolvedValue(undefined);
    mockDeleteFlow.mockResolvedValue(undefined);

    await expect(maybeUninstallOAuthMCP(userId, pluginKey, appConfig)).resolves.toBeUndefined();

    expect(mockRevokeOAuthToken).toHaveBeenCalledTimes(2);
    expect(mockDeleteUserTokens).toHaveBeenCalledTimes(1);
    expect(mockDeleteFlow).toHaveBeenCalledTimes(2);
    expect(mockLoggerError).toHaveBeenCalled();
  });
});
