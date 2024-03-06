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
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);

  const modelConfig = { ...defaultModelsConfig, ...customModelsConfig };

  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = { modelController, loadModels, getModelsConfig };
