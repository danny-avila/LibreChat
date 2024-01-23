const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { isUserProvided, extractEnvVariable } = require('~/server/utils');
const { fetchModels } = require('~/server/services/ModelService');
const loadCustomConfig = require('./loadCustomConfig');
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

  if (!Array.isArray(endpoints[EModelEndpoint.custom])) {
    return modelsConfig;
  }

  const customEndpoints = endpoints[EModelEndpoint.custom].filter(
    (endpoint) =>
      endpoint.baseURL &&
      endpoint.apiKey &&
      endpoint.name &&
      endpoint.models &&
      (endpoint.models.fetch || endpoint.models.default),
  );

  const fetchPromisesMap = {}; // Map for promises keyed by baseURL
  const baseUrlToNameMap = {}; // Map to associate baseURLs with names

  for (let i = 0; i < customEndpoints.length; i++) {
    const endpoint = customEndpoints[i];
    const { models, name, baseURL, apiKey } = endpoint;

    const API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    modelsConfig[name] = [];

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      fetchPromisesMap[BASE_URL] =
        fetchPromisesMap[BASE_URL] || fetchModels({ baseURL: BASE_URL, apiKey: API_KEY });
      baseUrlToNameMap[BASE_URL] = baseUrlToNameMap[BASE_URL] || [];
      baseUrlToNameMap[BASE_URL].push(name);
      continue;
    }

    if (Array.isArray(models.default)) {
      modelsConfig[name] = models.default;
    }
  }

  const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
  const baseUrls = Object.keys(fetchPromisesMap);

  for (let i = 0; i < fetchedData.length; i++) {
    const currentBaseUrl = baseUrls[i];
    const modelData = fetchedData[i];
    const associatedNames = baseUrlToNameMap[currentBaseUrl];

    for (const name of associatedNames) {
      modelsConfig[name] = modelData;
    }
  }

  return modelsConfig;
}

module.exports = loadConfigModels;
