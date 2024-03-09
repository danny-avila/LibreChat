const { EModelEndpoint, extractEnvVariable } = require('librechat-data-provider');
const { fetchModels } = require('~/server/services/ModelService');
const { isUserProvided } = require('~/server/utils');
const getCustomConfig = require('./getCustomConfig');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigModels
 * @param {Express.Request} req - The Express request object.
 */
async function loadConfigModels(req) {
  const customConfig = await getCustomConfig();

  if (!customConfig) {
    return {};
  }

  const { endpoints = {} } = customConfig ?? {};
  const modelsConfig = {};
  const azureModels = req.app.locals[EModelEndpoint.azureOpenAI]?.modelNames;
  const azureEndpoint = endpoints[EModelEndpoint.azureOpenAI];

  if (azureModels && azureEndpoint) {
    modelsConfig[EModelEndpoint.azureOpenAI] = azureModels;
  }

  if (azureModels && azureEndpoint && azureEndpoint.plugins) {
    modelsConfig[EModelEndpoint.gptPlugins] = azureModels;
  }

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

  const fetchPromisesMap = {}; // Map for promises keyed by unique combination of baseURL and apiKey
  const uniqueKeyToNameMap = {}; // Map to associate unique keys with endpoint names

  for (let i = 0; i < customEndpoints.length; i++) {
    const endpoint = customEndpoints[i];
    const { models, name, baseURL, apiKey } = endpoint;

    const API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    const uniqueKey = `${BASE_URL}__${API_KEY}`;

    modelsConfig[name] = [];

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      fetchPromisesMap[uniqueKey] =
        fetchPromisesMap[uniqueKey] ||
        fetchModels({
          user: req.user.id,
          baseURL: BASE_URL,
          apiKey: API_KEY,
          name,
          userIdQuery: models.userIdQuery,
        });
      uniqueKeyToNameMap[uniqueKey] = uniqueKeyToNameMap[uniqueKey] || [];
      uniqueKeyToNameMap[uniqueKey].push(name);
      continue;
    }

    if (Array.isArray(models.default)) {
      modelsConfig[name] = models.default;
    }
  }

  const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
  const uniqueKeys = Object.keys(fetchPromisesMap);

  for (let i = 0; i < fetchedData.length; i++) {
    const currentKey = uniqueKeys[i];
    const modelData = fetchedData[i];
    const associatedNames = uniqueKeyToNameMap[currentKey];

    for (const name of associatedNames) {
      modelsConfig[name] = modelData;
    }
  }

  return modelsConfig;
}

module.exports = loadConfigModels;
