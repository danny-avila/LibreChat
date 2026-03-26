const { CacheKeys } = require('librechat-data-provider');
const { AppService } = require('@librechat/data-schemas');
const { createAppConfigService } = require('@librechat/api');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const { setCachedTools } = require('./getCachedTools');
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

const { invalidateCachedTools } = require('./getCachedTools');

const { getAppConfig, clearAppConfigCache, clearOverrideCache } = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
});

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * and the endpoints config cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  await clearAppConfigCache();
  await clearOverrideCache(tenantId);
  await invalidateCachedTools({ invalidateGlobal: true });
  try {
    const configStore = getLogStores(CacheKeys.CONFIG_STORE);
    await configStore.delete(CacheKeys.ENDPOINT_CONFIG);
  } catch {
    // CONFIG_STORE or ENDPOINT_CONFIG may not exist — not critical
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  clearOverrideCache,
  invalidateConfigCaches,
};
