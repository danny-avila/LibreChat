const { EModelEndpoint } = require('librechat-data-provider');
const getCustomConfig = require('~/server/services/Config/getCustomConfig');

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
  return customEndpoints.find((endpointConfig) => endpointConfig.name === endpoint);
};

module.exports = getCustomEndpointConfig;
