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
 * and the MCP config-source server cache.
 *
 * The MCP step also refreshes the registry's effective `allowedDomains` /
 * `allowedAddresses` from the freshly merged config, so admin-panel
 * `mcpSettings` overrides take effect for inspection and connection without a
 * restart. The merged read uses `refresh: true` to bypass any stale cached
 * value; on failure the current allowlists are preserved (fail-safe).
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
  ]);
  const labels = ['clearAppConfigCache', 'clearOverrideCache', 'invalidateCachedTools'];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }

  let mcpAllowlists;
  try {
    const appConfig = await getAppConfig(
      tenantId ? { tenantId, refresh: true } : { refresh: true },
    );
    mcpAllowlists = {
      allowedDomains: appConfig?.mcpSettings?.allowedDomains,
      allowedAddresses: appConfig?.mcpSettings?.allowedAddresses,
    };
  } catch (error) {
    logger.error(
      '[invalidateConfigCaches] Failed to resolve merged MCP allowlists; preserving current:',
      error,
    );
  }

  try {
    await clearMcpConfigCache(mcpAllowlists);
  } catch (error) {
    logger.error('[invalidateConfigCaches] clearMcpConfigCache failed:', error);
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  invalidateConfigCaches,
};
