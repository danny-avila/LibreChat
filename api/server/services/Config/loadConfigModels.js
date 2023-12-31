const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { fetchModels } = require('~/server/services/ModelService');
const loadCustomConfig = require('./loadCustomConfig');
const { isUserProvided } = require('~/server/utils');
const { getLogStores } = require('~/cache');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigModels */
async function loadConfigModels() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let customConfig = await cache.get(CacheKeys.CUSTOM_CONFIG);

  if (!customConfig) {
    customConfig = await loadCustomConfig();
  }

  if (!customConfig) {
    return {};
  }

  const { endpoints = {} } = customConfig ?? {};
  const modelsConfig = {};

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
      const { models, name, baseURL, apiKey } = endpoint;

      modelsConfig[name] = [];

      // TODO: allow fetching with user provided api key and base url
      const shouldFetch = models.fetch && !isUserProvided(apiKey) && !isUserProvided(baseURL);
      if (shouldFetch) {
        modelsConfig[name] = await fetchModels({
          baseURL,
          apiKey,
        });
        continue;
      }

      if (Array.isArray(models.default)) {
        modelsConfig[name] = models.default;
      }
    }
  }

  return modelsConfig;
}

module.exports = loadConfigModels;
