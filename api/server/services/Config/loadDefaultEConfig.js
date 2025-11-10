const { EModelEndpoint, getEnabledEndpoints } = require('librechat-data-provider');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const { config } = require('./EndpointService');
const { generateConfig } = require('~/server/utils/handleText');

const fallbackConfigs = {
  [EModelEndpoint.openAI]: () => ({ userProvide: true }),
  [EModelEndpoint.google]: () => ({ userProvide: true }),
  [EModelEndpoint.anthropic]: () => ({ userProvide: true }),
  [EModelEndpoint.bedrock]: () => ({ userProvide: true }),
  [EModelEndpoint.assistants]: () =>
    generateConfig('user_provided', undefined, EModelEndpoint.assistants),
  [EModelEndpoint.azureAssistants]: () =>
    Object.assign(
      generateConfig('user_provided', undefined, EModelEndpoint.azureAssistants),
      { userProvideURL: true },
    ),
  [EModelEndpoint.azureOpenAI]: () => ({ userProvide: true, userProvideURL: true }),
  [EModelEndpoint.chatGPTBrowser]: () => ({ userProvide: true }),
  [EModelEndpoint.gptPlugins]: () => ({
    userProvide: true,
    azure: false,
    availableAgents: ['classic', 'functions'],
  }),
};

const resolveConfig = (endpointKey, value) => {
  if (value) {
    return value;
  }

  const fallbackFactory = fallbackConfigs[endpointKey];
  if (typeof fallbackFactory === 'function') {
    return fallbackFactory();
  }

  return value;
};

/**
 * Load async endpoints and return a configuration object
 * @param {AppConfig} appConfig - The app configuration object
 * @returns {Promise<Object.<string, EndpointWithOrder>>} An object whose keys are endpoint names and values are objects that contain the endpoint configuration and an order.
 */
async function loadDefaultEndpointsConfig(appConfig) {
  const { google, gptPlugins } = await loadAsyncEndpoints(appConfig);
  const { assistants, azureAssistants, azureOpenAI, chatGPTBrowser } = config;

  const enabledEndpoints = getEnabledEndpoints();

  const endpointConfig = {
    [EModelEndpoint.openAI]: resolveConfig(
      EModelEndpoint.openAI,
      config[EModelEndpoint.openAI],
    ),
    [EModelEndpoint.agents]: config[EModelEndpoint.agents],
    [EModelEndpoint.assistants]: resolveConfig(EModelEndpoint.assistants, assistants),
    [EModelEndpoint.azureAssistants]: resolveConfig(
      EModelEndpoint.azureAssistants,
      azureAssistants,
    ),
    [EModelEndpoint.azureOpenAI]: resolveConfig(
      EModelEndpoint.azureOpenAI,
      azureOpenAI,
    ),
    [EModelEndpoint.google]: resolveConfig(EModelEndpoint.google, google),
    [EModelEndpoint.chatGPTBrowser]: resolveConfig(
      EModelEndpoint.chatGPTBrowser,
      chatGPTBrowser,
    ),
    [EModelEndpoint.gptPlugins]: resolveConfig(EModelEndpoint.gptPlugins, gptPlugins),
    [EModelEndpoint.anthropic]: resolveConfig(
      EModelEndpoint.anthropic,
      config[EModelEndpoint.anthropic],
    ),
    [EModelEndpoint.bedrock]: resolveConfig(
      EModelEndpoint.bedrock,
      config[EModelEndpoint.bedrock],
    ),
  };

  const orderedAndFilteredEndpoints = enabledEndpoints.reduce((config, key, index) => {
    if (endpointConfig[key]) {
      config[key] = { ...(endpointConfig[key] ?? {}), order: index };
    }
    return config;
  }, {});

  return orderedAndFilteredEndpoints;
}

module.exports = loadDefaultEndpointsConfig;
