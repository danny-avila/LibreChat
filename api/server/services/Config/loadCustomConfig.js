const path = require('path');
const { CacheKeys, configSchema } = require('librechat-data-provider');
const loadYaml = require('~/utils/loadYaml');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const configPath = path.resolve(projectRoot, 'librechat.yaml');

/**
 * Load custom configuration files and caches the object if the `cache` field at root is true.
 * Validation via parsing the config file with the config schema.
 * @function loadCustomConfig
 * @returns {Promise<null | Object>} A promise that resolves to null or the custom config object.
 * */

async function loadCustomConfig() {
  const customConfig = loadYaml(configPath);
  if (!customConfig) {
    return null;
  }

  const result = configSchema.strict().safeParse(customConfig);
  if (!result.success) {
    logger.error(`Invalid custom config file at ${configPath}`, result.error);
    return null;
  } else {
    logger.info('Loaded custom config file:');
    logger.info(JSON.stringify(customConfig, null, 2));
  }

  if (customConfig.cache) {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);
  }

  // TODO: handle remote config

  return customConfig;
}

module.exports = loadCustomConfig;
