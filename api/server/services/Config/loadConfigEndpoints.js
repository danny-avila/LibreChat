const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const loadCustomConfig = require('./loadCustomConfig');
const { isUserProvided } = require('~/server/utils');
const { getLogStores } = require('~/cache');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigEndpoints */
async function loadConfigEndpoints() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let customConfig = await cache.get(CacheKeys.CUSTOM_CONFIG);

  if (!customConfig) {
    customConfig = await loadCustomConfig();
  }

  if (!customConfig) {
    return {};
  }

  const { endpoints = {} } = customConfig ?? {};

  const customEndpoints = endpoints[EModelEndpoint.custom];
  if (Array.isArray(customEndpoints)) {
    endpoints[EModelEndpoint.custom] = customEndpoints
      .filter((endpoint) => endpoint.baseURL && endpoint.apiKey && endpoint.name && endpoint.models)
      .map((endpoint) => {
        const { baseURL, apiKey, name } = endpoint;
        return {
          [name]: {
            type: EModelEndpoint.custom,
            userProvide: isUserProvided(apiKey),
            userProvideURL: isUserProvided(baseURL),
          },
        };
      });
  }

  return endpoints;
}

module.exports = loadConfigEndpoints;
