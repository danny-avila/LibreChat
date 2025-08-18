const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
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

  const baseConfig = await cache.get(CacheKeys.APP_CONFIG);
  if (!baseConfig) {
    throw new Error('App configuration not initialized. Please ensure AppService has been called.');
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

/**
 * Initialize the app configuration during startup
 * @param {AppConfig} config - The initial configuration to store
 * @returns {Promise<void>}
 */
async function setAppConfig(config) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.set(CacheKeys.APP_CONFIG, config);
  logger.debug('[getAppConfig] App configuration initialized');
}

module.exports = {
  getAppConfig,
  setAppConfig,
  clearAppConfigCache,
};
