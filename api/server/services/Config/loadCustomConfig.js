const path = require('path');
const { CacheKeys, configSchema, EImageOutputType } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const loadYaml = require('~/utils/loadYaml');
const { logger } = require('~/config');
const axios = require('axios');
const yaml = require('js-yaml');

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

  let customConfig;

  if (/^https?:\/\//.test(configPath)) {
    try {
      const response = await axios.get(configPath);
      customConfig = response.data;
    } catch (error) {
      i === 0 && logger.error(`Failed to fetch the remote config file from ${configPath}`, error);
      i === 0 && i++;
      return null;
    }
  } else {
    customConfig = loadYaml(configPath);
    if (!customConfig) {
      i === 0 &&
        logger.info(
          'Custom config file missing or YAML format invalid.\n\nCheck out the latest config file guide for configurable options and features.\nhttps://www.librechat.ai/docs/configuration/librechat_yaml\n\n',
        );
      i === 0 && i++;
      return null;
    }

    if (customConfig.reason || customConfig.stack) {
      i === 0 && logger.error('Config file YAML format is invalid:', customConfig);
      i === 0 && i++;
      return null;
    }
  }

  if (typeof customConfig === 'string') {
    try {
      customConfig = yaml.load(customConfig);
    } catch (parseError) {
      i === 0 && logger.info(`Failed to parse the YAML config from ${configPath}`, parseError);
      i === 0 && i++;
      return null;
    }
  }

  const result = configSchema.strict().safeParse(customConfig);
  if (result?.error?.errors?.some((err) => err?.path && err.path?.includes('imageOutputType'))) {
    throw new Error(
      `
Please specify a correct \`imageOutputType\` value (case-sensitive).

      The available options are:
      - ${EImageOutputType.JPEG}
      - ${EImageOutputType.PNG}
      - ${EImageOutputType.WEBP}
      
      Refer to the latest config file guide for more information:
      https://www.librechat.ai/docs/configuration/librechat_yaml`,
    );
  }
  if (!result.success) {
    let errorMessage = `Invalid custom config file at ${configPath}`;
    // Check if the error is due to unrecognized keys
    const unrecognizedKeysError = result.error.errors.find(
      (err) => err.code === 'unrecognized_keys',
    );
    if (unrecognizedKeysError) {
      // Log the initial part of the error message
      logger.error(errorMessage);
      // Log the note about the potential format change in separate calls to avoid truncation
      logger.error('Note: The configuration format has recently changed.');
      logger.error('If you\'re using an older format, please refer to the latest documentation at');
      logger.error('https://www.librechat.ai/docs/configuration/librechat_yaml');
      logger.error('to update your configuration file.');
    } else {
      errorMessage += `, ${JSON.stringify(result.error.errors)}`;
      logger.error(errorMessage);
    }
    i === 0 && i++;
    return null;
  }

  logger.debug('Custom config:', customConfig);

  if (customConfig.cache) {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);
  }

  if (result.data.modelSpecs) {
    customConfig.modelSpecs = result.data.modelSpecs;
  }

  return customConfig;
}

module.exports = loadCustomConfig;
