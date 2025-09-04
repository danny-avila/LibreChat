const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const AppService = require('~/server/services/AppService');
const { setCachedTools } = require('./getCachedTools');
const getLogStores = require('~/cache/getLogStores');

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, refresh } = options;

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = role ? `${CacheKeys.APP_CONFIG}:${role}` : CacheKeys.APP_CONFIG;

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let baseConfig = await cache.get(CacheKeys.APP_CONFIG);
  if (!baseConfig) {
    logger.info('[getAppConfig] App configuration not initialized. Initializing AppService...');
    baseConfig = await AppService();

    if (!baseConfig) {
      throw new Error('Failed to initialize app configuration through AppService.');
    }

    if (baseConfig.availableTools) {
      await setCachedTools(baseConfig.availableTools, { isGlobal: true });
    }

    await cache.set(CacheKeys.APP_CONFIG, baseConfig);
  }

  // For now, return the base config
  // In the future, this is where we'll apply role-based modifications
  if (role) {
    // TODO: Apply role-based config modifications
    // const roleConfig = await applyRoleBasedConfig(baseConfig, role);
    // await cache.set(cacheKey, roleConfig);
    // return roleConfig;
  }

  return baseConfig;
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
