const { getLogStores } = require('~/cache');
const { CacheKeys } = require('~/common/enums');
const { loadOverrideConfig } = require('~/server/services/Config');

async function overrideController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG);
  let overrideConfig = await cache.get(CacheKeys.OVERRIDE_CONFIG);
  if (overrideConfig) {
    res.send(overrideConfig);
    return;
  } else if (overrideConfig === false) {
    res.send(false);
    return;
  }
  overrideConfig = await loadOverrideConfig();
  const { endpointsConfig, modelsConfig } = overrideConfig;
  if (endpointsConfig) {
    await cache.set(CacheKeys.DEFAULT_CONFIG, endpointsConfig);
  }
  if (modelsConfig) {
    await cache.set(CacheKeys.MODELS_CONFIG, modelsConfig);
  }
  await cache.set(CacheKeys.OVERRIDE_CONFIG, overrideConfig);
  res.send(JSON.stringify(overrideConfig));
}

module.exports = overrideController;
