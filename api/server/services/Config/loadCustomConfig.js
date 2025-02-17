const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const { CacheKeys, configSchema, EImageOutputType } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const loadYaml = require('~/utils/loadYaml');
const { logger } = require('~/config');

const CONFIG = {
  PROJECT_ROOT: path.resolve(__dirname, '..', '..', '..', '..'),
  CACHE_TTL: 1000 * 60 * 5, // 5 minutes
  HTTP_TIMEOUT: 5000, // 5 seconds
  MAX_RETRIES: 3,
};

const defaultConfigPath = path.resolve(CONFIG.PROJECT_ROOT, 'librechat.yaml');
const CONFIG_URL_REGEX = /^https?:\/\//;
const IMAGE_OUTPUT_ERROR = `Please specify a correct \`imageOutputType\` value (case-sensitive).
Available options: ${Object.values(EImageOutputType).join(', ')}
See: https://www.librechat.ai/docs/configuration/librechat_yaml`;

// Cache management
class ConfigCache {
  constructor() {
    this.data = null;
    this.timestamp = null;
  }

  set(data) {
    this.data = data;
    this.timestamp = Date.now();
  }

  get() {
    if (!this.data || !this.timestamp) {
      return null;
    }
    if (Date.now() - this.timestamp > CONFIG.CACHE_TTL) {
      this.clear();
      return null;
    }
    return this.data;
  }

  clear() {
    this.data = null;
    this.timestamp = null;
  }
}

const configCache = new ConfigCache();

// Error handling
class ConfigError extends Error {
  constructor(message, type) {
    super(message);
    this.name = 'ConfigError';
    this.type = type;
  }
}

// Validation
const validateConfig = (config, configPath) => {
  const result = configSchema.strict().safeParse(config);

  if (result?.error?.errors?.some((err) => err?.path?.includes('imageOutputType'))) {
    throw new ConfigError(IMAGE_OUTPUT_ERROR, 'invalid_image_type');
  }

  if (!result.success) {
    throw new ConfigError(
      `Invalid config at ${configPath}:\n${JSON.stringify(result.error, null, 2)}`,
      'validation_error',
    );
  }

  return result;
};

// HTTP config loading with retries
const fetchConfig = async (url, retries = CONFIG.MAX_RETRIES) => {
  try {
    const { data } = await axios.get(url, { timeout: CONFIG.HTTP_TIMEOUT });
    return data;
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return fetchConfig(url, retries - 1);
    }
    throw error;
  }
};

// Main function
async function loadCustomConfig() {
  try {
    const cachedConfig = configCache.get();
    if (cachedConfig) {
      return cachedConfig;
    }

    const configPath = process.env.CONFIG_PATH || defaultConfigPath;
    let customConfig;

    if (CONFIG_URL_REGEX.test(configPath)) {
      customConfig = await fetchConfig(configPath);
    } else {
      customConfig = loadYaml(configPath);
      if (!customConfig) {
        throw new ConfigError('Config file missing or invalid YAML format', 'invalid_yaml');
      }
    }

    if (typeof customConfig === 'string') {
      customConfig = yaml.load(customConfig);
    }

    const result = validateConfig(customConfig, configPath);

    if (customConfig.cache) {
      const cache = getLogStores(CacheKeys.CONFIG_STORE);
      await cache.set(CacheKeys.CUSTOM_CONFIG, customConfig);
    }

    if (result.data.modelSpecs) {
      customConfig.modelSpecs = result.data.modelSpecs;
    }

    configCache.set(customConfig);
    logger.info('Config loaded successfully');
    logger.debug('Config details:', customConfig);

    return customConfig;
  } catch (error) {
    logger.error(`Config loading failed: ${error.message}`);
    return null;
  }
}

module.exports = loadCustomConfig;
