const { EModelEndpoint, extractEnvVariable } = require('librechat-data-provider');
const { isUserProvided, normalizeEndpointName } = require('~/server/utils');
const { getCustomConfig } = require('./getCustomConfig');

/**
 * Load config endpoints from the cached configuration object
 * @param {Express.Request} req - The request object
 * @returns {Promise<TEndpointsConfig>} A promise that resolves to an object containing the endpoints configuration
 */
async function loadConfigEndpoints(req) {
  const customConfig = await getCustomConfig();

  if (!customConfig) {
    return {};
  }

  const { endpoints = {} } = customConfig ?? {};
  const endpointsConfig = {};

  if (Array.isArray(endpoints[EModelEndpoint.custom])) {
    const customEndpoints = endpoints[EModelEndpoint.custom].filter(
      (endpoint) =>
        endpoint.baseURL &&
        endpoint.apiKey &&
        endpoint.name &&
        endpoint.models &&
        (endpoint.models.fetch || endpoint.models.default),
    );

    for (let i = 0; i < customEndpoints.length; i++) {
      const endpoint = customEndpoints[i];
      const { baseURL, apiKey, name: configName, iconURL, modelDisplayLabel } = endpoint;
      const name = normalizeEndpointName(configName);

      const resolvedApiKey = extractEnvVariable(apiKey);
      const resolvedBaseURL = extractEnvVariable(baseURL);

      endpointsConfig[name] = {
        type: EModelEndpoint.custom,
        userProvide: isUserProvided(resolvedApiKey),
        userProvideURL: isUserProvided(resolvedBaseURL),
        modelDisplayLabel,
        iconURL,
      };
    }
  }

  if (req.app.locals[EModelEndpoint.azureOpenAI]) {
    /** @type {Omit<TConfig, 'order'>} */
    endpointsConfig[EModelEndpoint.azureOpenAI] = {
      userProvide: false,
    };
  }

  if (req.app.locals[EModelEndpoint.azureOpenAI]?.assistants) {
    /** @type {Omit<TConfig, 'order'>} */
    endpointsConfig[EModelEndpoint.azureAssistants] = {
      userProvide: false,
    };
  }

  return endpointsConfig;
}

module.exports = loadConfigEndpoints;
