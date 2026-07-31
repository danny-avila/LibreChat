const mockUpdateUserPlugins = jest.fn();
const mockUpdateUserPluginAuth = jest.fn();
const mockGetAppConfig = jest.fn();
const mockInvalidateCachedTools = jest.fn();
const mockGetLogStores = jest.fn();
const mockGetMCPManager = jest.fn();
const mockGetFlowStateManager = jest.fn();
const mockGetMCPServersRegistry = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  getTenantId: jest.fn(),
  webSearchKeys: [],
}));

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: { FLOWS: 'flows' },
  Constants: { mcp_delimiter: '_mcp_', mcp_prefix: 'mcp_' },
  FileSources: {},
}));

/* The value-matching logic itself is covered in packages/api
 * (validateCustomUserVarValues); here it is mocked so the assertions stay on the
 * controller's wiring: what it validates against, what it persists, and what it
 * does on a rejection. */
const mockValidateCustomUserVarValues = jest.fn();

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: { generateFlowId: jest.fn(), generateTokenFlowId: jest.fn() },
  MCPTokenStorage: { getClientInfoAndMetadata: jest.fn(), deleteUserTokens: jest.fn() },
  normalizeHttpError: jest.fn((error) => error),
  extractWebSearchEnvVars: jest.fn((params) => params.keys),
  getAppConfigOptionsFromUser: jest.fn((user) => ({ userId: user?.id })),
  validateCustomUserVarValues: (...args) => mockValidateCustomUserVarValues(...args),
  needsRefresh: jest.fn(),
  getNewS3URL: jest.fn(),
}));

jest.mock('~/models', () => ({
  updateUserPlugins: (...args) => mockUpdateUserPlugins(...args),
  findToken: jest.fn(),
  deleteTokens: jest.fn(),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: (...args) => mockUpdateUserPluginAuth(...args),
  deleteUserPluginAuth: jest.fn(),
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

const { updateUserPluginsController } = require('~/server/controllers/UserController');

const customUserVars = {
  REGION: {
    title: 'Region',
    description: 'Target region',
    sensitive: false,
    values: ['eu-west-1', { value: 'us-east-1', label: 'US East (N. Virginia)' }],
  },
  SCOPES: {
    title: 'Scopes',
    description: 'Granted scopes',
    sensitive: false,
    values: ['read', 'write'],
    multiple: true,
  },
  TOKEN: { title: 'Token', description: 'API token' },
};

function createResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(auth) {
  return {
    config: { mcpConfig: {} },
    user: { id: 'user-1', _id: 'user-1', plugins: [], role: 'USER' },
    body: { pluginKey: 'mcp_test-server', action: 'install', auth },
  };
}

let registry;

beforeEach(() => {
  jest.clearAllMocks();
  registry = {
    ensureConfigServers: jest.fn().mockResolvedValue({}),
    getServerConfig: jest.fn().mockResolvedValue({ customUserVars }),
  };
  mockGetMCPServersRegistry.mockReturnValue(registry);
  mockValidateCustomUserVarValues.mockImplementation((_config, provided) => ({
    invalid: [],
    normalized: provided,
  }));
  mockGetMCPManager.mockReturnValue({ disconnectUserConnection: jest.fn() });
  mockUpdateUserPlugins.mockResolvedValue();
  mockUpdateUserPluginAuth.mockResolvedValue({});
  mockInvalidateCachedTools.mockResolvedValue();
  mockGetLogStores.mockReturnValue({});
});

describe('updateUserPluginsController customUserVars value validation', () => {
  it('validates the submitted values against the resolved server config', async () => {
    const auth = { REGION: 'us-east-1', SCOPES: 'read,write', TOKEN: 'anything' };
    const res = createResponse();
    await updateUserPluginsController(createRequest(auth), res);

    expect(registry.getServerConfig).toHaveBeenCalledWith('test-server', 'user-1', {});
    expect(mockValidateCustomUserVarValues).toHaveBeenCalledWith({ customUserVars }, auth);
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockUpdateUserPluginAuth).toHaveBeenCalledTimes(3);
  });

  it('persists the canonicalized values rather than the raw submission', async () => {
    mockValidateCustomUserVarValues.mockReturnValue({
      invalid: [],
      normalized: { REGION: 'us-east-1', SCOPES: 'read,write' },
    });

    const res = createResponse();
    await updateUserPluginsController(
      createRequest({ REGION: '  us-east-1  ', SCOPES: ' read , write ' }),
      res,
    );

    expect(mockUpdateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'REGION',
      'mcp_test-server',
      'us-east-1',
    );
    expect(mockUpdateUserPluginAuth).toHaveBeenCalledWith(
      'user-1',
      'SCOPES',
      'mcp_test-server',
      'read,write',
    );
  });

  it('rejects out-of-list values without writing credentials', async () => {
    mockValidateCustomUserVarValues.mockReturnValue({
      invalid: ['REGION', 'SCOPES'],
      normalized: {},
    });

    const res = createResponse();
    await updateUserPluginsController(createRequest({ REGION: 'ap-south-1' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Invalid value for variable(s): REGION, SCOPES',
    });
    expect(mockUpdateUserPluginAuth).not.toHaveBeenCalled();
    expect(mockUpdateUserPlugins).not.toHaveBeenCalled();
  });

  it('refuses the update when the server config cannot be resolved', async () => {
    registry.getServerConfig.mockRejectedValue(new Error('registry down'));

    const res = createResponse();
    await updateUserPluginsController(createRequest({ REGION: 'ap-south-1' }), res);

    expect(mockValidateCustomUserVarValues).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockUpdateUserPluginAuth).not.toHaveBeenCalled();
    expect(mockUpdateUserPlugins).not.toHaveBeenCalled();
  });

  it('skips validation for a server absent from the configuration', async () => {
    registry.getServerConfig.mockResolvedValue(undefined);

    const res = createResponse();
    await updateUserPluginsController(createRequest({ REGION: 'ap-south-1' }), res);

    expect(mockValidateCustomUserVarValues).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockUpdateUserPluginAuth).toHaveBeenCalledTimes(1);
  });

  it('skips validation for non-MCP plugin keys', async () => {
    const req = createRequest({ REGION: 'ap-south-1' });
    req.body.pluginKey = 'some-tool';

    const res = createResponse();
    await updateUserPluginsController(req, res);

    expect(registry.getServerConfig).not.toHaveBeenCalled();
    expect(mockValidateCustomUserVarValues).not.toHaveBeenCalled();
  });

  it('skips validation when revoking access', async () => {
    const req = createRequest({});
    req.body.action = 'uninstall';

    const res = createResponse();
    await updateUserPluginsController(req, res);

    expect(mockValidateCustomUserVarValues).not.toHaveBeenCalled();
  });
});
