const { logger, getTenantId } = require('@librechat/data-schemas');
const {
  getUserMCPAuthMap,
  createMCPToolCacheService,
  MCPServersRegistry,
  getMCPAuthorizationIdentity,
} = require('@librechat/api');
const { Constants } = require('librechat-data-provider');
const { getCachedTools, setCachedTools } = require('./getCachedTools');

const {
  mergeAppTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPServerTools,
  getMCPServerCatalog,
} = createMCPToolCacheService({
  getCachedTools,
  setCachedTools,
  getServerConfig: (serverName, userId) =>
    MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
  getSecurityPolicy: (userId) =>
    MCPServersRegistry.getInstance().resolveCatalogSecurityPolicy({ userId }),
});

async function getScopedMCPServerTools({
  user,
  serverName,
  serverConfig,
  customUserVars,
  findToken,
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

    const configuredOAuth = resolvedConfig.requiresOAuth === true || resolvedConfig.oauth != null;
    const authorizationIdentity = configuredOAuth
      ? await getMCPAuthorizationIdentity({ userId: user.id, serverName, findToken })
      : 'none';
    if (authorizationIdentity == null) {
      return null;
    }

    return await getMCPServerTools(
      user.id,
      serverName,
      resolvedConfig,
      resolvedCustomUserVars,
      user.tenantId ?? getTenantId() ?? null,
      authorizationIdentity,
    );
  } catch (error) {
    logger.warn(`[MCP Cache] Scoped catalog lookup unavailable for ${serverName}`, error);
    return null;
  }
}

module.exports = {
  mergeAppTools,
  getMCPServerTools,
  getScopedMCPServerTools,
  getMCPServerCatalog,
  cacheMCPServerTools,
  updateMCPServerTools,
};
