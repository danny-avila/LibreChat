const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
const {
  createAppConfigService,
  createConfigReloader,
  createConfigGenerationTracker,
  clearMcpConfigCache,
  createCodeEnvironmentRegistry,
  mergeAccessibleCodeEnvironments,
  cacheConfig,
  ioredisClient,
  standardCache,
} = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

let codeEnvironmentRegistry;

function getCodeEnvironmentRegistry() {
  if (codeEnvironmentRegistry == null) {
    codeEnvironmentRegistry = createCodeEnvironmentRegistry(mongoose, {
      configurationCache: cacheConfig.USE_REDIS
        ? standardCache('CODE_ENVIRONMENT_CONFIG')
        : undefined,
    });
  }
  return codeEnvironmentRegistry;
}

async function invalidateCodeEnvironmentConfigCache(tenantId) {
  await getCodeEnvironmentRegistry().invalidateAccessibleConfigurations(tenantId);
}

const buildBaseConfig = async (config) => {
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const loadBaseConfig = async (mode) => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig(mode === 'startup', { mode })) ?? {};
  return buildBaseConfig(config);
};

const configGeneration = createConfigGenerationTracker(
  cacheConfig.USE_REDIS ? ioredisClient : null,
);

const { getAppConfig, replaceBaseConfig, clearAppConfigCache, clearOverrideCache } =
  createAppConfigService({
    loadBaseConfig,
    setCachedTools,
    getCache: getLogStores,
    cacheKeys: CacheKeys,
    getApplicableConfigs: db.getApplicableConfigs,
    getUserPrincipals: db.getUserPrincipals,
    ...(configGeneration.distributed ? { syncConfigGeneration: configGeneration.check } : {}),
    augmentConfig: ({ appConfig, baseConfig, principals, options }) => {
      if (!options.userId) return appConfig;
      return mergeAccessibleCodeEnvironments({
        appConfig,
        deploymentConfig: baseConfig,
        actor: {
          userId: options.userId,
          role: options.role ?? null,
          idOnTheSource: options.idOnTheSource ?? null,
          principals,
        },
        registry: getCodeEnvironmentRegistry(),
      });
    },
  });

const reloadCustomConfig = createConfigReloader({
  loadConfig: () => loadCustomConfig(false, { mode: 'reload' }),
  buildBaseConfig,
  getBaseConfig: () => getAppConfig({ baseOnly: true }),
  replaceBaseConfig,
  clearOverrideCache,
  generation: configGeneration,
});

// Config owns the reader; models never import this module to obtain it.
db.initializeMessageBudget(getAppConfig);

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * and the MCP config-source server cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearMcpConfigCache(),
  ]);
  const labels = [
    'clearAppConfigCache',
    'clearOverrideCache',
    'invalidateCachedTools',
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
  clearOverrideCache,
  invalidateConfigCaches,
  reloadCustomConfig,
  getCodeEnvironmentRegistry,
  invalidateCodeEnvironmentConfigCache,
};
