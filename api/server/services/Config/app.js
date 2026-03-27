const { CacheKeys } = require('librechat-data-provider');
const { createAppConfigService } = require('@librechat/api');
const { AppService, logger } = require('@librechat/data-schemas');
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

/** Deletes the ENDPOINT_CONFIG entry from CONFIG_STORE. Failures are non-critical and swallowed. */
async function clearEndpointConfigCache() {
  try {
    const configStore = getLogStores(CacheKeys.CONFIG_STORE);
    await configStore.delete(CacheKeys.ENDPOINT_CONFIG);
  } catch {
    // CONFIG_STORE or ENDPOINT_CONFIG may not exist — not critical
  }
}

/**
 * Clears config-source MCP server inspection cache so servers are re-inspected on next access.
 * Disconnects active connections for evicted servers so removed configs don't linger.
 */
async function clearMcpConfigCache() {
  let registry;
  try {
    const { getMCPServersRegistry } = require('~/config');
    registry = getMCPServersRegistry();
  } catch {
    return; // Registry not initialized yet (startup) — not critical
  }

  try {
    const evictedServers = await registry.invalidateConfigCache();
    if (evictedServers.length > 0) {
      try {
        const { getMCPManager } = require('~/config');
        const mcpManager = getMCPManager();
        if (mcpManager?.appConnections) {
          await Promise.allSettled(
            evictedServers.map((serverName) =>
              mcpManager.appConnections.disconnect(serverName).catch(() => {}),
            ),
          );
        }
      } catch {
        // MCPManager may not be initialized — connections cleaned up lazily
      }
    }
  } catch (error) {
    logger.error('[clearMcpConfigCache] Failed to invalidate config cache:', error);
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
