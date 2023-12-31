const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultEndpointsConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

async function endpointController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
  if (cachedEndpointsConfig) {
    res.send(cachedEndpointsConfig);
    return;
  }

  const endpointsConfig = await loadDefaultEndpointsConfig();
  await cache.set(CacheKeys.ENDPOINT_CONFIG, endpointsConfig);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
