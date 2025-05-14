const { EModelEndpoint, anthropicSettings } = require('librechat-data-provider');
const { matchModelName } = require('~/utils');
const { logger } = require('~/config');

/**
 * @param {string} modelName
 * @returns {boolean}
 */
function checkPromptCacheSupport(modelName) {
  const modelMatch = matchModelName(modelName, EModelEndpoint.anthropic);
  if (
    modelMatch.includes('claude-3-5-sonnet-latest') ||
    modelMatch.includes('claude-3.5-sonnet-latest')
  ) {
    return false;
  }

  if (
    modelMatch === 'claude-3-7-sonnet' ||
    modelMatch === 'claude-3-5-sonnet' ||
    modelMatch === 'claude-3-5-haiku' ||
    modelMatch === 'claude-3-haiku' ||
    modelMatch === 'claude-3-opus' ||
    modelMatch === 'claude-3.7-sonnet' ||
    modelMatch === 'claude-3.5-sonnet' ||
    modelMatch === 'claude-3.5-haiku'
  ) {
    return true;
  }

  return false;
}

/**
 * Gets the appropriate headers for Claude models with cache control
 * @param {string} model The model name
 * @param {boolean} supportsCacheControl Whether the model supports cache control
 * @returns {AnthropicClientOptions['extendedOptions']['defaultHeaders']|undefined} The headers object or undefined if not applicable
 */
function getClaudeHeaders(model, supportsCacheControl) {
  if (!supportsCacheControl) {
    return undefined;
  }

  if (/claude-3[-.]5-sonnet/.test(model)) {
    return {
      'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31',
    };
  } else if (/claude-3[-.]7/.test(model)) {
    return {
      'anthropic-beta':
        'token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31',
    };
  } else {
    return {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
  }
}

/**
 * Configures reasoning-related options for Claude models
 * @param {AnthropicClientOptions & { max_tokens?: number }} anthropicInput The request options object
 * @param {Object} extendedOptions Additional client configuration options
 * @param {boolean} extendedOptions.thinking Whether thinking is enabled in client config
 * @param {number|null} extendedOptions.thinkingBudget The token budget for thinking
 * @returns {Object} Updated request options
 */
function configureReasoning(anthropicInput, extendedOptions = {}) {
  const updatedOptions = { ...anthropicInput };
  const currentMaxTokens = updatedOptions.max_tokens ?? updatedOptions.maxTokens;
  if (
    extendedOptions.thinking &&
    updatedOptions?.model &&
    /claude-3[-.]7/.test(updatedOptions.model)
  ) {
    updatedOptions.thinking = {
      type: 'enabled',
    };
  }

  if (updatedOptions.thinking != null && extendedOptions.thinkingBudget != null) {
    updatedOptions.thinking = {
      ...updatedOptions.thinking,
      budget_tokens: extendedOptions.thinkingBudget,
    };
  }

  if (
    updatedOptions.thinking != null &&
    (currentMaxTokens == null || updatedOptions.thinking.budget_tokens > currentMaxTokens)
  ) {
    const maxTokens = anthropicSettings.maxOutputTokens.reset(updatedOptions.model);
    updatedOptions.max_tokens = currentMaxTokens ?? maxTokens;

    logger.warn(
      updatedOptions.max_tokens === maxTokens
        ? '[AnthropicClient] max_tokens is not defined while thinking is enabled. Setting max_tokens to model default.'
        : `[AnthropicClient] thinking budget_tokens (${updatedOptions.thinking.budget_tokens}) exceeds max_tokens (${updatedOptions.max_tokens}). Adjusting budget_tokens.`,
    );

    updatedOptions.thinking.budget_tokens = Math.min(
      updatedOptions.thinking.budget_tokens,
      Math.floor(updatedOptions.max_tokens * 0.9),
    );
  }

  return updatedOptions;
}

module.exports = { checkPromptCacheSupport, getClaudeHeaders, configureReasoning };
