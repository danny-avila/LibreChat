const { isEnabled } = require('@librechat/api');
const { CacheKeys, EModelEndpoint } = require('librechat-data-provider');
const { normalizeEndpointName } = require('~/server/utils');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');

/**
 * Retrieves the configuration object
 * @function getCustomConfig
 * @returns {Promise<TCustomConfig | null>}
 * */
async function getCustomConfig() {
  const cache = getLogStores(CacheKeys.STATIC_CONFIG);
  return (await cache.get(CacheKeys.LIBRECHAT_YAML_CONFIG)) || (await loadCustomConfig());
}

/**
 * Retrieves the configuration object
 * @function getBalanceConfig
 * @returns {Promise<TCustomConfig['balance'] | null>}
 * */
async function getBalanceConfig() {
  const isLegacyEnabled = isEnabled(process.env.CHECK_BALANCE);
  const startBalance = process.env.START_BALANCE;
  /** @type {TCustomConfig['balance']} */
  const config = {
    enabled: isLegacyEnabled,
    startBalance: startBalance != null && startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const customConfig = await getCustomConfig();
  if (!customConfig) {
    return config;
  }
  return { ...config, ...(customConfig?.['balance'] ?? {}) };
}

/**
 *
 * @param {string | EModelEndpoint} endpoint
 * @returns {Promise<TEndpoint | undefined>}
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

/**
 * @returns {Promise<boolean>}
 */
async function hasCustomUserVars() {
  const customConfig = await getCustomConfig();
  const mcpServers = customConfig?.mcpServers;
  return Object.values(mcpServers ?? {}).some((server) => server.customUserVars);
}

module.exports = {
  getCustomConfig,
  getBalanceConfig,
  hasCustomUserVars,
  getCustomEndpointConfig,
};
