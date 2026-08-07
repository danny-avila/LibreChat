const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const {
  getCachedTools,
  setCachedTools,
  runWithGlobalCacheLock,
  getCachedAppServerSnapshots,
  setCachedAppServerSnapshots,
} = require('./getCachedTools');

const { mergeAppTools, cacheMCPServerTools, updateMCPServerTools, getMCPServerTools } =
  createMCPToolCacheService({
    getCachedTools,
    setCachedTools,
    getCachedAppServerSnapshots,
    setCachedAppServerSnapshots,
    runWithGlobalCacheLock,
    getServerConfig: (serverName, userId) =>
      MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
    getAllServerConfigs: () => MCPServersRegistry.getInstance().getAllServerConfigs(),
  });

module.exports = {
  mergeAppTools,
  getMCPServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
};
