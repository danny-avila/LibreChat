const { CacheKeys } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
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

const { getAppConfig, getMCPAppConfigSnapshot, clearAppConfigCache, clearOverrideCache } =
  createAppConfigService({
    loadBaseConfig,
    setCachedTools,
    getCache: getLogStores,
    cacheKeys: CacheKeys,
    getApplicableConfigs: (principals, options) =>
      db.getApplicableConfigs(principals, undefined, options),
    getUserPrincipals: db.getUserPrincipals,
  });

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears mutable override/tool caches while preserving the boot YAML snapshot.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearMcpConfigCache(),
  ]);
  const labels = ['clearOverrideCache', 'invalidateCachedTools', 'clearMcpConfigCache'];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }
}

module.exports = {
  getAppConfig,
  getMCPAppConfigSnapshot,
  clearAppConfigCache,
  invalidateConfigCaches,
};
