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
  prepareMCPAuthorizationMutation: jest.fn(),
}));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
}));
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  invalidateCachedTools: jest.fn(),
}));
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
jest.mock('~/server/services/MCPAuthorizationFenceRetry', () => ({
  clearMCPAuthorizationFenceRetry: jest.fn(),
  persistMCPAuthorizationFenceRetry: jest.fn(),
}));

const { CacheKeys } = require('librechat-data-provider');
const { getTenantId } = require('@librechat/data-schemas');
const {
  createAuthIdentityContext,
  createMCPAppsController,
  prepareMCPAuthorizationMutation,
} = require('@librechat/api');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getAppConfig, invalidateCachedTools } = require('~/server/services/Config');
const { resolveConfigServers } = require('~/server/services/MCP');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const models = require('~/models');
const { getLogStores } = require('~/cache');
const {
  clearMCPAuthorizationFenceRetry,
  persistMCPAuthorizationFenceRetry,
} = require('~/server/services/MCPAuthorizationFenceRetry');

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
    const request = {
      user: { id: 'user-1', role: 'USER', tenantId: 'tenant-1' },
      config: {
        mcpSettings: {
          catalogRecovery: {
            authorizationFenceRetryMs: [0, 25],
            authorizationFenceTimeoutMs: 750,
          },
        },
      },
    };
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
    const onOAuthCredentialsChanging = dependencies.createOAuthCredentialsChanging(request);
    const scope = { userId: 'user-1', serverName: 'srv' };
    await onOAuthCredentialsChanging(scope);
    expect(prepareMCPAuthorizationMutation).toHaveBeenCalledWith(scope, {
      invalidateRecoveryGeneration: invalidateCachedTools,
      persistPublicationRetry: persistMCPAuthorizationFenceRetry,
      clearPublicationRetry: clearMCPAuthorizationFenceRetry,
      clearLocalRecovery: expect.any(Function),
      retryDelaysMs: [0, 25],
      attemptTimeoutMs: 750,
    });
    const publicationDependencies = prepareMCPAuthorizationMutation.mock.calls[0][1];
    const manager = { clearCatalogRecoveryState: jest.fn() };
    getMCPManager.mockReturnValue(manager);
    publicationDependencies.clearLocalRecovery('user-1', 'srv');
    expect(manager.clearCatalogRecoveryState).toHaveBeenCalledWith('user-1', 'srv');
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
