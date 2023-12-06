const { getLogStores } = require('~/cache');
const { CacheKeys } = require('~/common/enums');
const { loadDefaultEndpointsConfig } = require('~/server/services/Config');

async function endpointController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG);
  const config = await cache.get(CacheKeys.DEFAULT_CONFIG);
  if (config) {
    res.send(config);
    return;
  }
  const defaultConfig = await loadDefaultEndpointsConfig();
  await cache.set(CacheKeys.DEFAULT_CONFIG, defaultConfig);
  res.send(JSON.stringify(defaultConfig));
}

module.exports = endpointController;
