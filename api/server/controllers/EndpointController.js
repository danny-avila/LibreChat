const { CacheKeys, EModelEndpoint, orderEndpointsConfig } = require('librechat-data-provider');
const { loadDefaultEndpointsConfig, loadConfigEndpoints } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

async function endpointController(req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(CacheKeys.ENDPOINT_CONFIG);
  if (cachedEndpointsConfig) {
    res.send(cachedEndpointsConfig);
    return;
  }

  const defaultEndpointsConfig = await loadDefaultEndpointsConfig(req);
  const customConfigEndpoints = await loadConfigEndpoints(req);

  /** @type {TEndpointsConfig} */
  const mergedConfig = { ...defaultEndpointsConfig, ...customConfigEndpoints };
  if (mergedConfig[EModelEndpoint.assistants] && req.app.locals?.[EModelEndpoint.assistants]) {
    mergedConfig[EModelEndpoint.assistants].disableBuilder =
      req.app.locals[EModelEndpoint.assistants].disableBuilder;
  }

  const endpointsConfig = orderEndpointsConfig(mergedConfig);

  await cache.set(CacheKeys.ENDPOINT_CONFIG, endpointsConfig);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
