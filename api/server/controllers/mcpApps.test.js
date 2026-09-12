const mockController = {
  readMCPResource: jest.fn(),
  listMCPResources: jest.fn(),
  listMCPResourceTemplates: jest.fn(),
  appToolCall: jest.fn(),
  serveMCPSandbox: jest.fn(),
  requireMCPAppsEnabled: jest.fn(),
};

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
  getTenantId: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  createAuthIdentityContext: jest.fn(),
  createMCPAppsController: jest.fn(() => mockController),
}));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));
jest.mock('~/server/services/MCP', () => ({ resolveConfigServers: jest.fn() }));
jest.mock('~/server/services/OpenIDSessionRefresh', () => ({
  createOpenIDSessionTokenProvider: jest.fn(),
}));
jest.mock('~/models', () => ({
  findPluginAuthsByKeys: jest.fn(),
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
  deleteTokens: jest.fn(),
}));
jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));

const { CacheKeys } = require('librechat-data-provider');
const { getTenantId } = require('@librechat/data-schemas');
const { createAuthIdentityContext, createMCPAppsController } = require('@librechat/api');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config');
const { resolveConfigServers } = require('~/server/services/MCP');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const models = require('~/models');
const { getLogStores } = require('~/cache');

describe('MCP Apps controller wiring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports the typed controller handlers and binds server dependencies', async () => {
    getLogStores.mockReturnValue('flow-store');
    getFlowStateManager.mockReturnValue('flow-manager');
    getAppConfig.mockResolvedValue({ mcpSettings: { apps: true } });
    resolveConfigServers.mockResolvedValue({ srv: { type: 'sse' } });
    getTenantId.mockReturnValue('tenant-1');
    createAuthIdentityContext.mockReturnValue('identity-context');
    createOpenIDSessionTokenProvider.mockReturnValue('provider');

    jest.isolateModules(() => {
      expect(require('./mcpApps')).toBe(mockController);
    });

    expect(createMCPAppsController).toHaveBeenCalledTimes(1);
    const dependencies = createMCPAppsController.mock.calls[0][0];
    const request = { user: { id: 'user-1', role: 'USER', tenantId: 'tenant-1' } };
    const response = {};

    expect(dependencies.getManager).toBe(getMCPManager);
    expect(dependencies.getFlowManager()).toBe('flow-manager');
    expect(getLogStores).toHaveBeenCalledWith(CacheKeys.FLOWS);
    await expect(dependencies.getAppConfig(request)).resolves.toEqual({
      mcpSettings: { apps: true },
    });
    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    await expect(dependencies.resolveConfigServers(request)).resolves.toEqual({
      srv: { type: 'sse' },
    });
    expect(resolveConfigServers).toHaveBeenCalledWith(request, { throwOnError: true });
    expect(dependencies.findPluginAuthsByKeys).toBe(models.findPluginAuthsByKeys);
    expect(dependencies.tokenMethods).toEqual({
      findToken: models.findToken,
      createToken: models.createToken,
      updateToken: models.updateToken,
      deleteTokens: models.deleteTokens,
    });
    expect(dependencies.createUpstreamTokenProvider(request, response, request.user)).toBe(
      'provider',
    );
    expect(createOpenIDSessionTokenProvider).toHaveBeenCalledWith({
      req: request,
      res: response,
      user: request.user,
      identityContext: 'identity-context',
      tokenPreference: 'access_token',
    });
    expect(createAuthIdentityContext).toHaveBeenCalledWith({
      user: request.user,
      tenantId: 'tenant-1',
    });
  });
});
