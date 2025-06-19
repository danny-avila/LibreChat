const { CacheKeys } = require('librechat-data-provider');
// const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config'); // Deprecated
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');
const { Provider, Model } = require('~/db/models'); // Import new models

/**
 * @param {ServerRequest} req
 */
const getModelsConfig = async (req) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  // TODO: Cache invalidation strategy will be needed if providers/models change frequently
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  // TODO: Cache invalidation strategy will be needed
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }

  // Fetch all providers
  const providers = await Provider.find({}).lean();
  const modelConfig = {};

  for (const provider of providers) {
    // Fetch models associated with this provider
    const models = await Model.find({ providerId: provider._id }).lean();
    // Store models as an array of modelId strings, or objects if more detail is needed by frontend
    // The current frontend seems to expect an array of strings (model names/IDs)
    // under endpointOption.modelsQuery.data[endpointName]
    modelConfig[provider.name] = models.map(model => model.modelId);
  }

  // TODO: Integrate any remaining static/default models if necessary,
  // or decide if all models must now come from the DB.
  // For now, this completely replaces the old logic.

  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  try {
    const modelConfig = await loadModels(req);
    // Ensure the response format is consistent with what the frontend expects (TModelsConfig)
    res.status(200).json(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
