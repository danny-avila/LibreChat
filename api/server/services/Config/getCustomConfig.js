const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const { isEnabled, getUserMCPAuthMap, normalizeEndpointName } = require('@librechat/api');
const { getAppConfig } = require('./app');

/**
 * Retrieves the configuration object
 * @function getBalanceConfig
 * @param {Object} params
 * @param {string} [params.role]
 * @returns {Promise<TCustomConfig['balance'] | null>}
 * */
async function getBalanceConfig({ role }) {
  const isLegacyEnabled = isEnabled(process.env.CHECK_BALANCE);
  const startBalance = process.env.START_BALANCE;
  /** @type {TCustomConfig['balance']} */
  const config = {
    enabled: isLegacyEnabled,
    startBalance: startBalance != null && startBalance ? parseInt(startBalance, 10) : undefined,
  };
  const appConfig = await getAppConfig({ role });
  if (!appConfig) {
    return config;
  }
  return { ...config, ...(appConfig?.['balance'] ?? {}) };
}

/**
 *
 * @param {string | EModelEndpoint} endpoint
 * @returns {Promise<TEndpoint | undefined>}
 */
const getCustomEndpointConfig = async (endpoint) => {
  const appConfig = await getAppConfig();
  if (!appConfig) {
    throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
  }

  const customEndpoints = appConfig.endpoints?.[EModelEndpoint.custom] ?? [];
  return customEndpoints.find(
    (endpointConfig) => normalizeEndpointName(endpointConfig.name) === endpoint,
  );
};

/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {GenericTool[]} [params.tools]
 * @param {import('@librechat/data-schemas').PluginAuthMethods['findPluginAuthsByKeys']} params.findPluginAuthsByKeys
 * @returns {Promise<Record<string, Record<string, string>> | undefined>}
 */
async function getMCPAuthMap({ userId, tools, findPluginAuthsByKeys }) {
  try {
    if (!tools || tools.length === 0) {
      return;
    }
    return await getUserMCPAuthMap({
      tools,
      userId,
      findPluginAuthsByKeys,
    });
  } catch (err) {
    logger.error(
      `[api/server/controllers/agents/client.js #chatCompletion] Error getting custom user vars for agent`,
      err,
    );
  }
}

/**
 * @returns {Promise<boolean>}
 */
async function hasCustomUserVars() {
  const customConfig = await getAppConfig();
  const mcpServers = customConfig?.mcpConfig;
  return Object.values(mcpServers ?? {}).some((server) => server.customUserVars);
}

module.exports = {
  getMCPAuthMap,
  getBalanceConfig,
  hasCustomUserVars,
  getCustomEndpointConfig,
};
