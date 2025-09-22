const { EModelEndpoint } = require('librechat-data-provider');

/**
 * Gets the configuration for OpenRouter endpoint
 * @returns {Object} OpenRouter endpoint configuration
 */
function getOpenRouterConfig() {
  return {
    type: EModelEndpoint.openrouter, // CRITICAL: This tells the system this IS an openrouter endpoint
    order: 7,
    userProvide: process.env.OPENROUTER_API_KEY === 'user_provided',
    availableModels: [],
    modelDisplayLabel: 'OpenRouter',
  };
}

module.exports = getOpenRouterConfig;
