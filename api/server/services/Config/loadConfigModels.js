const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { fetchModels } = require('~/server/services/ModelService');
const loadCustomConfig = require('./loadCustomConfig');
// const { isUserProvided } = require('~/server/utils');
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

  let customEndpoints = endpoints[EModelEndpoint.custom];
  const configModels = {
    [EModelEndpoint.custom]: [],
  };

  if (Array.isArray(customEndpoints)) {
    customEndpoints = customEndpoints.filter(
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
      if (models.fetch) {
        const customEndpoint = {
          [name]: await fetchModels({
            baseURL,
            apiKey,
          }),
        };

        configModels[EModelEndpoint.custom].push(customEndpoint);

        continue;
      }

      if (models.default) {
        configModels[EModelEndpoint.custom].push({ [name]: models.default });
      }
    }
  }

  return configModels;
}

module.exports = loadConfigModels;
