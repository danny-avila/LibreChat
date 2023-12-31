const path = require('path');
const { CacheKeys } = require('librechat-data-provider');
const loadYaml = require('~/utils/loadYaml');
const { getLogStores } = require('~/cache');

const apiRoot = path.resolve(__dirname, '..', '..', '..');
const configPath = path.resolve(apiRoot, 'data', 'custom-config.yaml');

/**
 * Load custom configuration files and caches the object if the `cache` field at root is true.
 * @function loadCustomConfig
 * @returns {Promise<null | Object>} A promise that resolves to null or the custom config object.
 * */

async function loadCustomConfig() {
  const customConfig = loadYaml(configPath);
  if (!customConfig) {
    return null;
  }

  if (customConfig.cache) {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);
  }

  // TODO: handle remote config

  return customConfig;
}

module.exports = loadCustomConfig;
