const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const { getCachedTools, setCachedTools } = require('./getCachedTools');

const {
  mergeAppTools,
  replaceAppServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPServerTools,
} = createMCPToolCacheService({
  getCachedTools,
  setCachedTools,
  getServerConfig: (serverName, userId) =>
    MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
});

module.exports = {
  mergeAppTools,
  replaceAppServerTools,
  getMCPServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
};
