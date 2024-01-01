const { CacheKeys } = require('librechat-data-provider');
const loadCustomConfig = require('~/server/services/Config/loadCustomConfig');
const getLogStores = require('./getLogStores');

/**
 * Retrieves the configuration object
 * @function getCustomConfig */
async function getCustomConfig() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let customConfig = await cache.get(CacheKeys.CUSTOM_CONFIG);

  if (!customConfig) {
    customConfig = await loadCustomConfig();
  }

  if (!customConfig) {
    return null;
  }

  return customConfig;
}

module.exports = getCustomConfig;
