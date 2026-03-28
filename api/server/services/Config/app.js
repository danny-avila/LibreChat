const { CacheKeys } = require('librechat-data-provider');
const { AppService, logger, scopedCacheKey } = require('@librechat/data-schemas');
const { createAppConfigService, clearMcpConfigCache } = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

const loadBaseConfig = async () => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const { getAppConfig, clearAppConfigCache, clearOverrideCache } = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
});

/**
 * Deletes ENDPOINT_CONFIG entries from CONFIG_STORE.
 * Clears both the tenant-scoped key (if in tenant context) and the
 * unscoped base key (populated by unauthenticated /api/endpoints calls).
 * Other tenants' scoped keys are NOT actively cleared — they expire
 * via TTL. Config mutations in one tenant do not propagate immediately
 * to other tenants' endpoint config caches.
 */
async function clearEndpointConfigCache() {
  try {
    const configStore = getLogStores(CacheKeys.CONFIG_STORE);
    const scoped = scopedCacheKey(CacheKeys.ENDPOINT_CONFIG);
    const keys = [scoped];
    if (scoped !== CacheKeys.ENDPOINT_CONFIG) {
      keys.push(CacheKeys.ENDPOINT_CONFIG);
    }
    await Promise.all(keys.map((k) => configStore.delete(k)));
  } catch {
    // CONFIG_STORE or ENDPOINT_CONFIG may not exist — not critical
  }
}

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * the endpoints config cache, and the MCP config-source server cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearEndpointConfigCache(),
    clearMcpConfigCache(),
  ]);
  const labels = [
    'clearAppConfigCache',
    'clearOverrideCache',
    'invalidateCachedTools',
    'clearEndpointConfigCache',
    'clearMcpConfigCache',
  ];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  invalidateConfigCaches,
};
