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
 * For global (non-tenant) mutations, the MCP step also refreshes the registry's
 * effective `allowedDomains` / `allowedAddresses` from the freshly merged config,
 * so admin-panel `mcpSettings` overrides take effect for inspection and connection
 * without a restart. The read uses `refresh: true` (bypass stale cache) and
 * `strictOverrides: true` (throw rather than silently fall back to YAML on a DB
 * error) so a transient failure preserves the current allowlists instead of
 * overwriting them. Tenant-scoped mutations skip this refresh: the registry is a
 * process-wide singleton read by all connection paths, so pushing one tenant's
 * allowlist into it would leak across tenants (per-tenant allowlists are not
 * representable at this layer); only the config-server cache is evicted.
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
  if (!tenantId) {
    try {
      const appConfig = await getAppConfig({ refresh: true, strictOverrides: true });
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
