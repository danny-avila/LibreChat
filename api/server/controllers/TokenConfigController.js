const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint, normalizeEndpointName } = require('librechat-data-provider');
const { buildTokenConfigMap, getTokenConfigKey, tokenConfigCache } = require('@librechat/api');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { getValueKey, getMultiplier, getCacheMultiplier } = require('~/models');

/**
 * Returns server-resolved context windows (and pricing when
 * `interface.contextCost` is enabled) for every configured model.
 * @param {ServerRequest} req
 * @param {ServerResponse} res
 */
async function tokenConfigController(req, res) {
  try {
    const appConfig = req.config;
    const includePricing = appConfig?.interfaceConfig?.contextCost === true;
    const modelsConfig = await getModelsConfig(req);

    /** @type {Record<string, import('@librechat/api').EndpointTokenConfig | undefined>} */
    const endpointTokenConfigs = {};
    const customEndpoints = appConfig?.endpoints?.[EModelEndpoint.custom] ?? [];
    const cache = tokenConfigCache();
    for (const endpointConfig of customEndpoints) {
      /** Models config and the token-config cache key by the normalized name */
      const name = normalizeEndpointName(endpointConfig?.name);
      if (!name) {
        continue;
      }
      if (endpointConfig.tokenConfig != null) {
        endpointTokenConfigs[name] = endpointConfig.tokenConfig;
        continue;
      }
      /** Model fetches and chat initialization both store under this key —
       *  user-scoped whenever the fetched config can be user-specific, so a
       *  plain-name fallback would risk serving another user's entry */
      const tokenKey = getTokenConfigKey(endpointConfig, name, req.user.id);
      const cached = await cache.get(tokenKey);
      if (cached) {
        endpointTokenConfigs[name] = cached;
      }
    }

    const tokenConfigMap = buildTokenConfigMap(
      { modelsConfig, endpointTokenConfigs, includePricing },
      { getValueKey, getMultiplier, getCacheMultiplier },
    );
    res.json(tokenConfigMap);
  } catch (error) {
    logger.error('[tokenConfigController]', error);
    res.status(500).json({ error: 'Failed to resolve token config' });
  }
}

module.exports = tokenConfigController;
