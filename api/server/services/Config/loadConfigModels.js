const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, extractEnvVariable, CacheKeys, ErrorTypes } = require('librechat-data-provider');
const { fetchModels } = require('~/server/services/ModelService');
const { Key } = require('~/db/models');
const { decrypt } = require('@librechat/api');
const { isUserProvided, normalizeEndpointName } = require('~/server/utils');
const { getCustomConfig } = require('./getCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const { sortModels } = require('./loadModelOrder'); // optionally provide model sorting order
const { getFromModelCache, addToModelCache, removeFromModelCache } = require('~/cache/modelHelpers');

/**
 * Retrieves and decrypts the key object including expiry date for a given user identified by userId and identifier name.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<Record<string,string>>} The decrypted key object.
 * @throws {Error} Throws an error if the key is not found, there is a problem during key retrieval, parsing or decryption
 * @description This function searches for a user's key in the database using their userId and name.
 *              If found, it decrypts the value of the key and returns it as object including expiry date.
 *              If no key is found, it throws an error indicating that there is no user key available.
 */
const getUserKeyWithExpiry = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }
  try {
    return { ...JSON.parse(await decrypt(keyValue.value)), expiresAt: keyValue.expiresAt };
  } catch (e) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.INVALID_USER_KEY,
      }),
    );
  }
};
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
  const userId = req.user.id;

  const { endpoints = {} } = customConfig ?? {};
  const modelsConfig = {};
  const azureEndpoint = endpoints[EModelEndpoint.azureOpenAI];
  const azureConfig = req.app.locals[EModelEndpoint.azureOpenAI];
  const { modelNames } = azureConfig ?? {};

  if (modelNames && azureEndpoint) {
    modelsConfig[EModelEndpoint.azureOpenAI] = modelNames;
  }

  if (modelNames && azureEndpoint && azureEndpoint.plugins) {
    modelsConfig[EModelEndpoint.gptPlugins] = modelNames;
  }

  if (azureEndpoint?.assistants && azureConfig.assistantModels) {
    modelsConfig[EModelEndpoint.azureAssistants] = azureConfig.assistantModels;
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
    const { models, name: configName, baseURL, apiKey } = endpoint;
    const name = normalizeEndpointName(configName);
    endpointsMap[name] = endpoint;

    let API_KEY = extractEnvVariable(apiKey);
    const BASE_URL = extractEnvVariable(baseURL);

    modelsConfig[name] = [];
    /** if key user provided and not expired use it instead of user_defined */
    if (models.fetch && isUserProvided(API_KEY)) {
      try {
        const userKey = await getUserKeyWithExpiry({ userId, name });
        if (!userKey.expiresAt || new Date(userKey.expiresAt).getTime() > Date.now()) {
          // in case the key is not expired (expires never if expiresAt is missing) replace the default key with the user provided key
          API_KEY = userKey.apiKey || API_KEY;
        } else {
          // if key is expired remove it from the cache
          removeFromModelCache(userId, name);
        }
      } catch (e) {
        // ignore if key is missing or invalid
        logger.warn(`Failed to retrieve user key for endpoint: ${name}, id:${req.user.id}`, e);
      }
    }

    const uniqueKey = getUniqueKey(BASE_URL, API_KEY);

    if (models.fetch && !isUserProvided(API_KEY) && !isUserProvided(BASE_URL)) {
      const cachedModels = await getFromModelCache(userId, name);
      if (cachedModels) {
        fetchPromisesMap[uniqueKey] = Promise.resolve(cachedModels);
      } else {
        fetchPromisesMap[uniqueKey] =
          fetchPromisesMap[uniqueKey] ||
          fetchModels({
            user: req.user.id,
            baseURL: BASE_URL,
            apiKey: API_KEY,
            name,
            userIdQuery: models.userIdQuery,
          }).then((models) => {
            // add models to cache
            const sorted = sortModels(models);
            logger.info(`${name}, cache models for user: ${userId} [${sorted.join(', ')}]`);
            return addToModelCache(userId, name, sorted).then(() => sorted);
          });
      }
      uniqueKeyToEndpointsMap[uniqueKey] = uniqueKeyToEndpointsMap[uniqueKey] || [];
      uniqueKeyToEndpointsMap[uniqueKey].push(name);
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
    const associatedNames = uniqueKeyToEndpointsMap[currentKey];

    for (const name of associatedNames) {
      const endpoint = endpointsMap[name];
      modelsConfig[name] = !modelData?.length ? (endpoint.models.default ?? []) : modelData;
    }
  }

  return modelsConfig;
}
const keyRemoveFromCache = async (key) => {
  await getLogStores(CacheKeys.MODEL_QUERIES).delete(key);
};
const getUniqueKey = (url, key) => `${url}__${key}`;
module.exports = loadConfigModels;
