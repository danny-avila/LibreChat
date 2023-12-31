const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

async function modelController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (modelConfig) {
    res.send(modelConfig);
    return;
  }
  modelConfig = await loadDefaultModels();
  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  res.send(modelConfig);
}

module.exports = modelController;
