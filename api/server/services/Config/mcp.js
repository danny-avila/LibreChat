const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const {
  getCachedTools,
  updateCachedGlobalTools,
  setCachedToolsWithinGlobalLock,
  getCachedAppServerTools,
  setCachedAppServerTools,
  setCachedToolsIfCurrent,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
} = require('./getCachedTools');

const {
  syncStaticTools,
  mergeAppTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPServerTools,
} = createMCPToolCacheService({
  getCachedTools,
  updateCachedGlobalTools,
  setCachedTools: setCachedToolsWithinGlobalLock,
  setCachedToolsIfCurrent,
  getCachedAppServerTools,
  setCachedAppServerTools,
  getServerConfig: (serverName, userId) =>
    MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
  getAllServerConfigs: () => MCPServersRegistry.getInstance().getAllServerConfigs(),
  isAppServerConfig: (serverName, effectiveConfig) =>
    MCPServersRegistry.getInstance().isAppServerConfig(serverName, effectiveConfig),
});

/**
 * A server's effective config for one user, argument-ordered like the other MCP
 * tool dependencies. Resolves `consumeOnly` for servers the user reaches only
 * through an agent, and returns undefined when the user cannot reach it at all.
 * @param {string} userId
 * @param {string} serverName
 * @returns {Promise<import('@librechat/api').ParsedServerConfig | undefined>}
 */
const getMCPServerConfigForUser = (userId, serverName) =>
  MCPServersRegistry.getInstance().getServerConfig(serverName, userId);

module.exports = {
  syncStaticTools,
  mergeAppTools,
  getMCPServerTools,
  getMCPServerConfigForUser,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
};
