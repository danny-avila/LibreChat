const { getTenantId } = require('@librechat/data-schemas');
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

const withTenant = (options = {}) => ({
  ...options,
  tenantId: options.tenantId ?? getTenantId?.() ?? null,
});

module.exports = {
  ToolCacheKeys,
  ...store,
  getCachedMCPServerCatalog: (options) => store.getCachedMCPServerCatalog(withTenant(options)),
  setCachedMCPServerCatalog: (catalog, options) =>
    store.setCachedMCPServerCatalog(catalog, withTenant(options)),
  invalidateCachedTools: (options) => store.invalidateCachedTools(withTenant(options)),
};
