const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const { getCachedTools, setCachedTools, runWithGlobalCacheLock } = require('./getCachedTools');

const { mergeAppTools, cacheMCPServerTools, updateMCPServerTools, getMCPServerTools } =
  createMCPToolCacheService({
    getCachedTools,
    setCachedTools,
    runWithGlobalCacheLock,
    getServerConfig: (serverName, userId) =>
      MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
  });

module.exports = {
  mergeAppTools,
  getMCPServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
};
