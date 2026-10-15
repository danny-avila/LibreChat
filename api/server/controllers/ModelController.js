const { logger } = require('@librechat/data-schemas');
const { filterEndpointCatalog } = require('@librechat/api');
const {
  loadDefaultModels,
  loadConfigModels,
  getEndpointsConfig,
} = require('~/server/services/Config');

const getModelsConfig = async (req) => {
  const [modelsConfig, endpointsConfig] = await Promise.all([
    loadModels(req),
    getEndpointsConfig(req),
  ]);
  return filterEndpointCatalog(modelsConfig, Object.keys(endpointsConfig));
};

async function loadModels(req) {
  const [defaultModelsConfig, customModelsConfig] = await Promise.all([
    loadDefaultModels(req),
    loadConfigModels(req),
  ]);
  return { ...defaultModelsConfig, ...customModelsConfig };
}

async function modelController(req, res) {
  try {
    const modelConfig = await getModelsConfig(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
