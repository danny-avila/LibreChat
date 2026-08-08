const { CacheKeys } = require('librechat-data-provider');
const {
  cacheConfig,
  ioredisClient,
  keyvRedisClient,
  mcpConfig,
  ToolCacheKeys,
  createMCPCatalogStore,
} = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const store = createMCPCatalogStore({
  cacheConfig,
  ioredisClient,
  keyvRedisClient,
  userConnectionIdleTimeout: mcpConfig.USER_CONNECTION_IDLE_TIMEOUT,
  getCache: () => getLogStores(CacheKeys.TOOL_CACHE),
});

module.exports = { ToolCacheKeys, ...store };
