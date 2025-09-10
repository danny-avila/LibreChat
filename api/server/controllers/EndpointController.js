const { getEndpointsConfig } = require('~/server/services/Config');
const { CacheKeys } = require('librechat-data-provider');
const { getLogStores } = require('~/cache');

async function endpointController(req, res) {
  // Clear endpoint config cache to reflect newly available runtimes like Ollama
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  await cache.delete(CacheKeys.ENDPOINT_CONFIG);
  const endpointsConfig = await getEndpointsConfig(req);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
