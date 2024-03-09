const path = require('path');
const { CacheKeys, configSchema } = require('librechat-data-provider');
const loadYaml = require('~/utils/loadYaml');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultConfigPath = path.resolve(projectRoot, 'librechat.yaml');

let i = 0;

/**
 * Load custom configuration files and caches the object if the `cache` field at root is true.
 * Validation via parsing the config file with the config schema.
 * @function loadCustomConfig
 * @returns {Promise<TCustomConfig | null>} A promise that resolves to null or the custom config object.
 * */
async function loadCustomConfig() {
  // Use CONFIG_PATH if set, otherwise fallback to defaultConfigPath
  const configPath = process.env.CONFIG_PATH || defaultConfigPath;

  const customConfig = loadYaml(configPath);
  if (!customConfig) {
    i === 0 &&
      logger.info(
        'Custom config file missing or YAML format invalid.\n\nCheck out the latest config file guide for configurable options and features.\nhttps://docs.librechat.ai/install/configuration/custom_config.html\n\n',
      );
    i === 0 && i++;
    return null;
  }

  const result = configSchema.strict().safeParse(customConfig);
  if (!result.success) {
    logger.error(`Invalid custom config file at ${configPath}`, result.error);
    return null;
  } else {
    logger.info('Custom config file loaded:');
    logger.info(JSON.stringify(customConfig, null, 2));
    logger.debug('Custom config:', customConfig);
  }

  if (customConfig.cache) {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);
  }

  // TODO: handle remote config

  return customConfig;
}

module.exports = loadCustomConfig;
