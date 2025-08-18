const { isUserProvided, normalizeEndpointName } = require('@librechat/api');
const { EModelEndpoint, extractEnvVariable } = require('librechat-data-provider');
const { getAppConfig } = require('./app');

/**
 * Load config endpoints from the cached configuration object
 * @param {Express.Request} req - The request object
 * @returns {Promise<TEndpointsConfig>} A promise that resolves to an object containing the endpoints configuration
 */
async function loadConfigEndpoints(req) {
  const appConfig = await getAppConfig({ role: req.user?.role });
  if (!appConfig) {
    return {};
  }

  const endpointsConfig = {};

  if (Array.isArray(appConfig[EModelEndpoint.custom])) {
    const customEndpoints = appConfig[EModelEndpoint.custom].filter(
      (endpoint) =>
        endpoint.baseURL &&
        endpoint.apiKey &&
        endpoint.name &&
        endpoint.models &&
        (endpoint.models.fetch || endpoint.models.default),
    );

    for (let i = 0; i < customEndpoints.length; i++) {
      const endpoint = customEndpoints[i];
      const {
        baseURL,
        apiKey,
        name: configName,
        iconURL,
        modelDisplayLabel,
        customParams,
      } = endpoint;
      const name = normalizeEndpointName(configName);

      const resolvedApiKey = extractEnvVariable(apiKey);
      const resolvedBaseURL = extractEnvVariable(baseURL);

      endpointsConfig[name] = {
        type: EModelEndpoint.custom,
        userProvide: isUserProvided(resolvedApiKey),
        userProvideURL: isUserProvided(resolvedBaseURL),
        modelDisplayLabel,
        iconURL,
        customParams,
      };
    }
  }

  if (appConfig[EModelEndpoint.azureOpenAI]) {
    /** @type {Omit<TConfig, 'order'>} */
    endpointsConfig[EModelEndpoint.azureOpenAI] = {
      userProvide: false,
    };
  }

  if (appConfig[EModelEndpoint.azureOpenAI]?.assistants) {
    /** @type {Omit<TConfig, 'order'>} */
    endpointsConfig[EModelEndpoint.azureAssistants] = {
      userProvide: false,
    };
  }

  return endpointsConfig;
}

module.exports = loadConfigEndpoints;
