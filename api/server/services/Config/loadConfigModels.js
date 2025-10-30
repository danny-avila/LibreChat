const { isUserProvided, normalizeEndpointName } = require('@librechat/api');
const { EModelEndpoint, extractEnvVariable } = require('librechat-data-provider');
const { fetchModels } = require('~/server/services/ModelService');
const { getAppConfig } = require('./app');

/**
 * Load config endpoints from the cached configuration object
 * @function loadConfigModels
 * @param {ServerRequest} req - The Express request object.
 */
async function loadConfigModels(req) {
  const appConfig = await getAppConfig({ role: req.user?.role });
  if (!appConfig) {
    return {};
  }
  const modelsConfig = {};
  const azureConfig = appConfig.endpoints?.[EModelEndpoint.azureOpenAI];
  const { modelNames } = azureConfig ?? {};

  if (modelNames && azureConfig) {
    modelsConfig[EModelEndpoint.azureOpenAI] = modelNames;
  }

  if (modelNames && azureConfig && azureConfig.plugins) {
    modelsConfig[EModelEndpoint.gptPlugins] = modelNames;
  }

  if (azureConfig?.assistants && azureConfig.assistantModels) {
    modelsConfig[EModelEndpoint.azureAssistants] = azureConfig.assistantModels;
  }

  if (!Array.isArray(appConfig.endpoints?.[EModelEndpoint.custom])) {
    return modelsConfig;
  }

  const customEndpoints = appConfig.endpoints[EModelEndpoint.custom].filter(
    (endpoint) =>
      endpoint.baseURL &&
      endpoint.apiKey &&
      endpoint.name &&
      endpoint.models &&
      (endpoint.models.fetch || endpoint.models.default),
  );

  /**
   * @type {Record<string, Promise<string[]>>}
   * Map for promises keyed by unique combination of baseURL and apiKey */
  const fetchPromisesMap = {};
  /**
   * @type {Record<string, string[]>}
   * Map to associate unique keys with endpoint names; note: one key may can correspond to multiple endpoints */
  const uniqueKeyToEndpointsMap = {};
  /**
   * @type {Record<string, Partial<TEndpoint>>}
   * Map to associate endpoint names to their configurations */
  const endpointsMap = {};

  for (let i = 0; i < customEndpoints.length; i++) {
    const endpoint = customEndpoints[i];
    const { models, name: configName, baseURL, apiKey, headers: endpointHeaders } = endpoint;
    const name = normalizeEndpointName(configName);
    endpointsMap[name] = endpoint;

    const API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    const uniqueKey = `${BASE_URL}__${API_KEY}`;

    modelsConfig[name] = [];

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      fetchPromisesMap[uniqueKey] =
        fetchPromisesMap[uniqueKey] ||
        fetchModels({
          name,
          apiKey: API_KEY,
          baseURL: BASE_URL,
          user: req.user.id,
          userObject: req.user,
          headers: endpointHeaders,
          direct: endpoint.directEndpoint,
          userIdQuery: models.userIdQuery,
        });
      uniqueKeyToEndpointsMap[uniqueKey] = uniqueKeyToEndpointsMap[uniqueKey] || [];
      uniqueKeyToEndpointsMap[uniqueKey].push(name);
      continue;
    }

    if (Array.isArray(models.default)) {
      modelsConfig[name] = models.default.map((model) =>
        typeof model === 'string' ? model : model.name,
      );
    }
  }

  const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
  const uniqueKeys = Object.keys(fetchPromisesMap);

  for (let i = 0; i < fetchedData.length; i++) {
    const currentKey = uniqueKeys[i];
    const modelData = fetchedData[i];
    const associatedNames = uniqueKeyToEndpointsMap[currentKey];

    for (const name of associatedNames) {
      const endpoint = endpointsMap[name];
      modelsConfig[name] = !modelData?.length ? (endpoint.models.default ?? []) : modelData;
    }
  }

  return modelsConfig;
}

module.exports = loadConfigModels;
