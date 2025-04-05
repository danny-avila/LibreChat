const { openAISettings } = require('librechat-data-provider');
const { logger } = require('~/config');

/**
 * Configures reasoning-related options for OpenAI models
 * @param {Object} openAIInput The request options object
 * @param {Object} extendedOptions Additional client configuration options
 * @param {boolean} extendedOptions.thinking Whether thinking is enabled in client config
 * @param {number|null} extendedOptions.thinkingBudget The token budget for thinking
 * @param {string} extendedOptions.context The context of the request (e.g., 'title', 'message')
 * @returns {Object} Updated request options
 */
function configureReasoning(openAIInput, extendedOptions = {}) {
  const updatedOptions = { ...openAIInput };

  // Skip adding thinking parameters for title generation
  if (extendedOptions.context === 'title') {
    // Make sure to remove any existing parameters
    delete updatedOptions.thinking;
    return updatedOptions;
  }

  // Configure thinking parameters if enabled
  if (extendedOptions.thinking === true && extendedOptions.thinkingBudget) {
    updatedOptions.thinking = {
      type: 'enabled',
      budget_tokens: extendedOptions.thinkingBudget,
    };
  }

  return updatedOptions;
}

module.exports = { configureReasoning };
