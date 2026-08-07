const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const {
  getCachedTools,
  setCachedToolsWithinGlobalLock,
  runWithGlobalCacheLock,
  getCachedAppServerSnapshots,
  setCachedAppServerSnapshots,
  setCachedToolsIfCurrent,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
} = require('./getCachedTools');

const { mergeAppTools, cacheMCPServerTools, updateMCPServerTools, getMCPServerTools } =
  createMCPToolCacheService({
    getCachedTools,
    setCachedTools: setCachedToolsWithinGlobalLock,
    setCachedToolsIfCurrent,
    getCachedAppServerSnapshots,
    setCachedAppServerSnapshots,
    runWithGlobalCacheLock,
    getServerConfig: (serverName, userId) =>
      MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
    getAllServerConfigs: () => MCPServersRegistry.getInstance().getAllServerConfigs(),
    isAppServerConfig: (serverName, effectiveConfig) =>
      MCPServersRegistry.getInstance().isAppServerConfig(serverName, effectiveConfig),
  });

module.exports = {
  mergeAppTools,
  getMCPServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
};
