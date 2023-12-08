const { getLogStores } = require('~/cache');
const { CacheKeys } = require('~/common/enums');
const { loadDefaultModels } = require('~/server/services/Config');

async function modelController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG);
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
