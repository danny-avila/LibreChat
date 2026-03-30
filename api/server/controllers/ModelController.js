const { logger } = require('@librechat/data-schemas');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');

/** Delegates to loadModels. No result caching here — getAppConfig caches resolved config per
 *  principal (role+user+tenant), and fetchModels caches upstream /models responses per
 *  (baseURL+apiKey) hash with a 2-minute TTL in the MODEL_QUERIES store. */
const getModelsConfig = (req) => loadModels(req);

async function loadModels(req) {
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);
  return { ...defaultModelsConfig, ...customModelsConfig };
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
