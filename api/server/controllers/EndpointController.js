const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { loadDefaultEndpointsConfig, loadConfigEndpoints } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

async function endpointController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
  if (cachedEndpointsConfig) {
    res.send(cachedEndpointsConfig);
    return;
  }

  const defaultEndpointsConfig = await loadDefaultEndpointsConfig();
  const customConfigEndpoints = await loadConfigEndpoints();

  const endpointsConfig = { ...defaultEndpointsConfig, ...customConfigEndpoints };
  if (endpointsConfig[EModelEndpoint.assistants] && req.app.locals?.[EModelEndpoint.assistants]) {
    endpointsConfig[EModelEndpoint.assistants].disableBuilder =
      req.app.locals[EModelEndpoint.assistants].disableBuilder;
  }

  await cache.set(CacheKeys.ENDPOINT_CONFIG, endpointsConfig);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
