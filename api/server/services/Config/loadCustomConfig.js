const path = require('path');
const axios = require('axios');
const yaml = require('js-yaml');
const keyBy = require('lodash/keyBy');
const { loadYaml } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  configSchema,
  paramSettings,
  EImageOutputType,
  agentParamSettings,
  validateSettingDefinitions,
} = require('librechat-data-provider');

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const defaultConfigPath = path.resolve(projectRoot, 'librechat.yaml');

let i = 0;

/**
 * Load custom configuration files and caches the object if the `cache` field at root is true.
 * Validation via parsing the config file with the config schema.
 * @function loadCustomConfig
 * @returns {Promise<TCustomConfig | null>} A promise that resolves to null or the custom config object.
 * */
async function loadCustomConfig(printConfig = true) {
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
    let errorMessage = `Invalid custom config file at ${configPath}:
${JSON.stringify(result.error, null, 2)}`;

    logger.error(errorMessage);
    const speechError = result.error.errors.find(
      (err) =>
        err.code === 'unrecognized_keys' &&
        (err.message?.includes('stt') || err.message?.includes('tts')),
    );

    if (speechError) {
      logger.warn(`
The Speech-to-text and Text-to-speech configuration format has recently changed.
If you're getting this error, please refer to the latest documentation:

https://www.librechat.ai/docs/configuration/stt_tts`);
    }

    if (process.env.CONFIG_BYPASS_VALIDATION === 'true') {
      logger.warn(
        'CONFIG_BYPASS_VALIDATION is enabled. Continuing with default configuration despite validation errors.',
      );
      return null;
    }

    logger.error(
      'Exiting due to invalid configuration. Set CONFIG_BYPASS_VALIDATION=true to bypass this check.',
    );
    process.exit(1);
  } else {
    if (printConfig) {
      logger.info('Custom config file loaded:');
      logger.info(JSON.stringify(customConfig, null, 2));
      logger.debug('Custom config:', customConfig);
    }
  }

  (customConfig.endpoints?.custom ?? [])
    .filter((endpoint) => endpoint.customParams)
    .forEach((endpoint) => parseCustomParams(endpoint.name, endpoint.customParams));

  if (result.data.modelSpecs) {
    customConfig.modelSpecs = result.data.modelSpecs;
  }

  return customConfig;
}

// Validate and fill out missing values for custom parameters
function parseCustomParams(endpointName, customParams) {
  const paramEndpoint = customParams.defaultParamsEndpoint;
  customParams.paramDefinitions = customParams.paramDefinitions || [];

  // Checks if `defaultParamsEndpoint` is a key in `paramSettings`.
  const validEndpoints = new Set([
    ...Object.keys(paramSettings),
    ...Object.keys(agentParamSettings),
  ]);
  if (!validEndpoints.has(paramEndpoint)) {
    throw new Error(
      `defaultParamsEndpoint of "${endpointName}" endpoint is invalid. ` +
        `Valid options are ${Array.from(validEndpoints).join(', ')}`,
    );
  }

  // creates default param maps
  const regularParams = paramSettings[paramEndpoint] ?? [];
  const agentParams = agentParamSettings[paramEndpoint] ?? [];
  const defaultParams = regularParams.concat(agentParams);
  const defaultParamsMap = keyBy(defaultParams, 'key');

  // TODO: Remove this check once we support new parameters not part of default parameters.
  // Checks if every key in `paramDefinitions` is valid.
  const validKeys = new Set(Object.keys(defaultParamsMap));
  const paramKeys = customParams.paramDefinitions.map((param) => param.key);
  if (paramKeys.some((key) => !validKeys.has(key))) {
    throw new Error(
      `paramDefinitions of "${endpointName}" endpoint contains invalid key(s). ` +
        `Valid parameter keys are ${Array.from(validKeys).join(', ')}`,
    );
  }

  // Fill out missing values for custom param definitions
  customParams.paramDefinitions = customParams.paramDefinitions.map((param) => {
    return { ...defaultParamsMap[param.key], ...param, optionType: 'custom' };
  });

  try {
    validateSettingDefinitions(customParams.paramDefinitions);
  } catch (e) {
    throw new Error(
      `Custom parameter definitions for "${endpointName}" endpoint is malformed: ${e.message}`,
    );
  }
}

module.exports = loadCustomConfig;
