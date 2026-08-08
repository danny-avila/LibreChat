const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  getUserMCPAuthMap,
  createMCPToolCacheService,
  MCPServersRegistry,
  getMCPAuthorizationIdentity,
  isOAuthServer,
} = require('@librechat/api');
const { Constants } = require('librechat-data-provider');
const {
  getCachedTools,
  updateCachedGlobalTools,
  setCachedToolsWithinGlobalLock,
  setCachedToolsIfCurrent,
  getCachedAppServerTools,
  setCachedAppServerTools,
  getCachedMCPServerCatalog,
  setCachedMCPServerCatalog,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
} = require('./getCachedTools');

const {
  syncStaticTools,
  mergeAppTools,
  cacheMCPServerTools,
  cacheScopedMCPServerTools,
  updateMCPServerTools,
  getMCPServerTools,
  getScopedMCPServerTools: getScopedCachedMCPServerTools,
  getMCPServerCatalog,
} = createMCPToolCacheService({
  getCachedTools,
  updateCachedGlobalTools,
  setCachedTools: setCachedToolsWithinGlobalLock,
  setCachedToolsIfCurrent,
  getCachedAppServerTools,
  setCachedAppServerTools,
  getMCPServerCatalog: getCachedMCPServerCatalog,
  setMCPServerCatalog: setCachedMCPServerCatalog,
  getServerConfig: (serverName, userId) =>
    MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
  getAllServerConfigs: () => MCPServersRegistry.getInstance().getAllServerConfigs(),
  isAppServerConfig: (serverName, effectiveConfig) =>
    MCPServersRegistry.getInstance().isAppServerConfig(serverName, effectiveConfig),
  getScopedSecurityPolicy: (principal) =>
    MCPServersRegistry.getInstance().resolveCatalogSecurityPolicy(principal),
});

async function getScopedMCPServerTools({
  user,
  serverName,
  serverConfig,
  customUserVars,
  findToken,
  findTokens,
  findPluginAuthsByKeys,
}) {
  try {
    const resolvedConfig =
      serverConfig ?? (await MCPServersRegistry.getInstance().getServerConfig(serverName, user.id));
    if (!resolvedConfig) {
      return null;
    }

    let resolvedCustomUserVars = customUserVars;
    if (
      resolvedCustomUserVars === undefined &&
      Object.keys(resolvedConfig.customUserVars ?? {}).length > 0
    ) {
      const userMCPAuthMap = await getUserMCPAuthMap({
        userId: user.id,
        servers: [serverName],
        findPluginAuthsByKeys,
      });
      resolvedCustomUserVars = userMCPAuthMap[`${Constants.mcp_prefix}${serverName}`];
    }

    const configuredOAuth = isOAuthServer(resolvedConfig);
    const authorizationIdentity = configuredOAuth
      ? await getMCPAuthorizationIdentity({ userId: user.id, serverName, findToken, findTokens })
      : 'none';
    if (authorizationIdentity == null) {
      return null;
    }

    return await getScopedCachedMCPServerTools({
      userId: user.id,
      serverName,
      serverConfig: resolvedConfig,
      customUserVars: resolvedCustomUserVars,
      tenantId: user.tenantId ?? getTenantId() ?? null,
      role: user.role,
      authorizationIdentity,
    });
  } catch (error) {
    logger.warn(`[MCP Cache] Scoped catalog lookup unavailable for ${serverName}`, error);
    return null;
  }
}

module.exports = {
  syncStaticTools,
  mergeAppTools,
  getMCPServerTools,
  getScopedCachedMCPServerTools,
  getScopedMCPServerTools,
  getMCPServerCatalog,
  cacheMCPServerTools,
  cacheScopedMCPServerTools,
  updateMCPServerTools,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
};
