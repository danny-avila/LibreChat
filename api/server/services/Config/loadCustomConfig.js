const path = require('path');
const { CacheKeys } = require('librechat-data-provider');
const loadYaml = require('~/utils/loadYaml');
const { getLogStores } = require('~/cache');

const apiRoot = path.resolve(__dirname, '..', '..', '..');
const configPath = path.resolve(apiRoot, 'data', 'custom-config.yaml');

/**
 * Load custom endpoints and caches the configuration object
 * @function loadCustomConfig */
async function loadCustomConfig() {
  const customConfig = loadYaml(configPath);
  if (!customConfig) {
    return null;
  }

  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);

  // TODO: handle remote config

  // return customConfig;
}

module.exports = loadCustomConfig;
