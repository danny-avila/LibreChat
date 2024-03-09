const { CacheKeys } = require('librechat-data-provider');
const { loadOverrideConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

async function overrideController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
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
    await cache.set(CacheKeys.ENDPOINT_CONFIG, endpointsConfig);
  }
  if (modelsConfig) {
    await cache.set(CacheKeys.MODELS_CONFIG, modelsConfig);
  }
  await cache.set(CacheKeys.OVERRIDE_CONFIG, overrideConfig);
  res.send(JSON.stringify(overrideConfig));
}

module.exports = overrideController;
