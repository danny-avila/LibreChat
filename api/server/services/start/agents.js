const { EModelEndpoint, agentsEndpointSChema } = require('librechat-data-provider');

/**
 * Sets up the Agents configuration from the config (`librechat.yaml`) file.
 * @param {TCustomConfig} config - The loaded custom configuration.
 * @returns {Partial<TAgentsEndpoint>} The Agents endpoint configuration.
 */
function agentsConfigSetup(config) {
  const agentsConfig = config.endpoints[EModelEndpoint.agents];
  const parsedConfig = agentsEndpointSChema.parse(agentsConfig);
  return parsedConfig;
}

module.exports = { agentsConfigSetup };
