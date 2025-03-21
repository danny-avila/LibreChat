const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { normalizeEndpointName, isEnabled } = require('~/server/utils');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');

/**
 * Retrieves the configuration object
 * @function getCustomConfig
 * @returns {Promise<TCustomConfig | null>}
 * */
async function getCustomConfig() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let customConfig = await cache.get(CacheKeys.CUSTOM_CONFIG);

  if (!customConfig) {
    customConfig = await loadCustomConfig();
  }

  if (!customConfig) {
    return null;
  }

  return customConfig;
}

/**
 * Retrieves the configuration object
 * @function getBalanceConfig
 * @returns {Promise<TCustomConfig['balance'] | null>}
 * */
async function getBalanceConfig() {
  const isLegacyEnabled = isEnabled(process.env.CHECK_BALANCE);
  const startBalance = process.env.START_BALANCE;
  if (isLegacyEnabled || (startBalance != null && startBalance)) {
    /** @type {TCustomConfig['balance']} */
    const config = {
      enabled: isLegacyEnabled,
      startBalance: startBalance ? parseInt(startBalance, 10) : undefined,
    };
    return config;
  }
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return null;
  }
  return customConfig?.['balance'] ?? null;
}

/**
 *
 * @param {string | EModelEndpoint} endpoint
 */
const getCustomEndpointConfig = async (endpoint) => {
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const { endpoints = {} } = customConfig;
  const customEndpoints = endpoints[EModelEndpoint.custom] ?? [];
  return customEndpoints.find(
    (endpointConfig) => normalizeEndpointName(endpointConfig.name) === endpoint,
  );
};

module.exports = { getCustomConfig, getBalanceConfig, getCustomEndpointConfig };
