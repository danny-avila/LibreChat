const { EModelEndpoint } = require('librechat-data-provider');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const { config } = require('./EndpointService');

/**
 * Load async endpoints and return a configuration object
 * @function loadDefaultEndpointsConfig
 * @returns {Promise<Object.<string, EndpointWithOrder>>} An object whose keys are endpoint names and values are objects that contain the endpoint configuration and an order.
 */
async function loadDefaultEndpointsConfig() {
  const { google, gptPlugins } = await loadAsyncEndpoints();
  const { openAI, bingAI, anthropic, azureOpenAI, chatGPTBrowser } = config;

  let enabledEndpoints = [
    EModelEndpoint.openAI,
    EModelEndpoint.azureOpenAI,
    EModelEndpoint.google,
    EModelEndpoint.bingAI,
    EModelEndpoint.chatGPTBrowser,
    EModelEndpoint.gptPlugins,
    EModelEndpoint.anthropic,
  ];

  const endpointsEnv = process.env.ENDPOINTS || '';
  if (endpointsEnv) {
    enabledEndpoints = endpointsEnv
      .split(',')
      .filter((endpoint) => endpoint?.trim())
      .map((endpoint) => endpoint.trim());
  }

  const endpointConfig = {
    [EModelEndpoint.openAI]: openAI,
    [EModelEndpoint.azureOpenAI]: azureOpenAI,
    [EModelEndpoint.google]: google,
    [EModelEndpoint.bingAI]: bingAI,
    [EModelEndpoint.chatGPTBrowser]: chatGPTBrowser,
    [EModelEndpoint.gptPlugins]: gptPlugins,
    [EModelEndpoint.anthropic]: anthropic,
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
