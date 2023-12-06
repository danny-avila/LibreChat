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
  await cache.set(CacheKeys.OVERRIDE_CONFIG, overrideConfig);
  res.send(JSON.stringify(overrideConfig));
}

module.exports = overrideController;
