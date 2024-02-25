const { EModelEndpoint } = require('librechat-data-provider');
const { isUserProvided, extractEnvVariable } = require('~/server/utils');
const getCustomConfig = require('./getCustomConfig');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigEndpoints */
async function loadConfigEndpoints() {
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
      const { baseURL, apiKey, name, iconURL, modelDisplayLabel } = endpoint;

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

  return endpointsConfig;
}

module.exports = loadConfigEndpoints;
