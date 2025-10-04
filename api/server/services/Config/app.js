const { buildUserConfig } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys, PrincipalType } = require('librechat-data-provider');
const { getApplicableConfigs, getUserPrincipals } = require('~/models');
const AppService = require('~/server/services/AppService');
const { setCachedTools } = require('./getCachedTools');
const getLogStores = require('~/cache/getLogStores');

const BASE_CONFIG_KEY = '_BASE_';

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.userId] - User ID (used to determine role if role not provided)
 * @param {string} [options.role] - User role for role-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { userId, role, refresh } = options;

  const cache = getLogStores(CacheKeys.APP_CONFIG);

  let baseConfig = await cache.get(BASE_CONFIG_KEY);
  if (!baseConfig || refresh) {
    logger.info('[getAppConfig] Loading base configuration from YAML...');
    baseConfig = await AppService();

    if (!baseConfig) {
      throw new Error('Failed to initialize app configuration through AppService.');
    }

    if (baseConfig.availableTools) {
      await setCachedTools(baseConfig.availableTools);
    }

    await cache.set(BASE_CONFIG_KEY, baseConfig);
  }

  if (!role && !userId) {
    return baseConfig;
  }

  const principals = await getUserPrincipals({ userId, role, includeGroups: false });
  if (principals.length === 0) {
    return baseConfig;
  }

  const configs = [];
  const missingPrincipals = [];

  for (const principal of principals) {
    const configCacheKey = `config:${principal.principalType}:${principal.principalId}`;

    if (!refresh) {
      const cachedConfig = await cache.get(configCacheKey);
      if (cachedConfig) {
        configs.push(cachedConfig);
        continue;
      }
    }

    // Track which principals we need to fetch from DB, only roles for now
    if (principal.principalType === PrincipalType.ROLE) {
      missingPrincipals.push(principal);
    }
  }

  // Fetch missing configs from DB with single optimized query
  if (missingPrincipals.length > 0) {
    try {
      // Single $or query fetches all missing configs at once
      const dbConfigs = await getApplicableConfigs(missingPrincipals);

      // Cache each returned config individually
      for (const config of dbConfigs) {
        const configCacheKey = `config:${config.principalType}:${config.principalId}`;
        await cache.set(configCacheKey, config);
        configs.push(config);
      }
    } catch (error) {
      logger.error('[getAppConfig] Error fetching configs from DB:', error);
    }
  }

  // No configs found, return base config
  if (configs.length === 0) {
    return baseConfig;
  }

  // Merge fresh baseConfig with configs on each request
  try {
    return await buildUserConfig({
      baseConfig,
      cachedConfigs: configs,
    });
  } catch (error) {
    logger.error('[getAppConfig] Error merging configs, falling back to base:', error);
    return baseConfig;
  }
}

/**
 * Clear the app configuration cache
 * @returns {Promise<boolean>}
 */
async function clearAppConfigCache() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = CacheKeys.APP_CONFIG;
  return await cache.delete(cacheKey);
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
};
