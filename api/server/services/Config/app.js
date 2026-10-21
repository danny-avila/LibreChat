const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { AppService } = require('@librechat/data-schemas');
const {
  createAppConfigService,
  clearMcpConfigCache,
  createCodeEnvironmentRegistry,
  createConfigCacheInvalidation,
  createRedisConfigInvalidationPubSub,
  mergeAccessibleCodeEnvironments,
  ioredisClient,
  cacheConfig,
  standardCache,
} = require('@librechat/api');
const { setCachedTools } = require('./getCachedTools');
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

const loadBaseConfig = async (mode) => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig(true, { mode })) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const { getAppConfig, clearOverrideCache } = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
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

// Config owns the reader; models never import this module to obtain it.
db.initializeMessageBudget(getAppConfig);

/**
 * Admin config writes change DB overrides only, so they clear what is merged from them: the
 * per-principal override caches and the MCP config-source servers. The YAML base config and
 * the tools derived from it are untouched, so a write no longer re-reads librechat.yaml. With
 * Redis, the clear is broadcast so every instance drops its in-process merged config.
 */
const configCacheInvalidation = createConfigCacheInvalidation({
  clears: [
    { label: 'clearOverrideCache', clear: clearOverrideCache },
    { label: 'clearMcpConfigCache', clear: () => clearMcpConfigCache() },
  ],
  pubsub: createRedisConfigInvalidationPubSub({
    useRedis: cacheConfig.USE_REDIS,
    client: ioredisClient,
    namespace: cacheConfig.REDIS_KEY_PREFIX,
  }),
});

/**
 * Invalidate the config caches an admin config mutation affects, on every instance.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
function invalidateConfigCaches(tenantId) {
  return configCacheInvalidation.invalidate(tenantId);
}

module.exports = {
  getAppConfig,
  invalidateConfigCaches,
  getCodeEnvironmentRegistry,
  invalidateCodeEnvironmentConfigCache,
};
