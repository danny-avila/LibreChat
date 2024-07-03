const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

const getModelsConfig = async (req) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {Express.Request} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const modelConfig = { ...(await loadDefaultModels(req)), ...(await loadConfigModels(req)) };

  // caching for other services
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = { modelController, loadModels, getModelsConfig };
