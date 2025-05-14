const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

/**
 * @param {ServerRequest} req
 */
const getModelsConfig = async (req) => {
  // never caching all models (caching per endpoint+key)
  return await loadModels(req);
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req) {
  const modelConfig = { ...(await loadDefaultModels(req)), ...(await loadConfigModels(req)) };
  return modelConfig;
}

async function modelController(req, res) {
  try {
    const modelConfig = await loadModels(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
