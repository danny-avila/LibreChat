import { logger } from '@librechat/data-schemas';
import { AnthropicClientOptions } from '@librechat/agents';
import { EModelEndpoint, anthropicSettings } from 'librechat-data-provider';
import { matchModelName } from '~/utils/tokens';

/**
 * Detects if a model is a Claude model that supports advanced features
 * @param {string} modelName - The model name or ARN
 * @returns {boolean} - Whether the model supports advanced features
 */
function isClaudeModelWithAdvancedFeatures(modelName: string): boolean {
  // Handle AWS Bedrock custom inference profile ARNs
  const inferenceProfilePattern =
    /^arn:aws:bedrock:[^:]+:\d+:application-inference-profile\/[^:]+$/;
  if (inferenceProfilePattern.test(modelName)) {
    // For custom inference profiles, we need to check the underlying model
    // This would ideally be done by querying the AWS Bedrock API
    // For now, we'll assume it supports advanced features if configured
    return true;
  }

  const modelMatch = matchModelName(modelName, EModelEndpoint.anthropic) ?? '';
  if (
    modelMatch.includes('claude-3-5-sonnet-latest') ||
    modelMatch.includes('claude-3.5-sonnet-latest')
  ) {
    return false;
  }

  return (
    /claude-3[-.]7/.test(modelMatch) ||
    /claude-3[-.]5-(?:sonnet|haiku)/.test(modelMatch) ||
    /claude-3-(?:sonnet|haiku|opus)?/.test(modelMatch) ||
    /claude-(?:sonnet|opus|haiku)-[4-9]/.test(modelMatch) ||
    /claude-[4-9]-(?:sonnet|opus|haiku)?/.test(modelMatch) ||
    /claude-4(?:-(?:sonnet|opus|haiku))?/.test(modelMatch)
  );
}

/**
 * @param {string} modelName
 * @returns {boolean}
 */
function checkPromptCacheSupport(modelName: string): boolean {
  return isClaudeModelWithAdvancedFeatures(modelName);
}

/**
 * Gets the appropriate headers for Claude models with cache control
 * @param {string} model The model name
 * @param {boolean} supportsCacheControl Whether the model supports cache control
 * @returns {AnthropicClientOptions['extendedOptions']['defaultHeaders']|undefined} The headers object or undefined if not applicable
 */
function getClaudeHeaders(
  model: string,
  supportsCacheControl: boolean,
): Record<string, string> | undefined {
  if (!supportsCacheControl) {
    return undefined;
  }

  // Handle AWS Bedrock custom inference profile ARNs
  const inferenceProfilePattern =
    /^arn:aws:bedrock:[^:]+:\d+:application-inference-profile\/[^:]+$/;
  if (inferenceProfilePattern.test(model)) {
    // For custom inference profiles, use default headers
    // The actual model capabilities would be determined by the underlying model
    return {
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
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
  } else if (/claude-sonnet-4/.test(model)) {
    return {
      'anthropic-beta': 'prompt-caching-2024-07-31,context-1m-2025-08-07',
    };
  } else if (
    /claude-(?:sonnet|opus|haiku)-[4-9]/.test(model) ||
    /claude-[4-9]-(?:sonnet|opus|haiku)?/.test(model) ||
    /claude-4(?:-(?:sonnet|opus|haiku))?/.test(model)
  ) {
    return {
      'anthropic-beta': 'prompt-caching-2024-07-31',
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
function configureReasoning(
  anthropicInput: AnthropicClientOptions & { max_tokens?: number },
  extendedOptions: { thinking?: boolean; thinkingBudget?: number | null } = {},
): AnthropicClientOptions & { max_tokens?: number } {
  const updatedOptions = { ...anthropicInput };
  const currentMaxTokens = updatedOptions.max_tokens ?? updatedOptions.maxTokens;

  // Handle AWS Bedrock custom inference profile ARNs
  const inferenceProfilePattern =
    /^arn:aws:bedrock:[^:]+:\d+:application-inference-profile\/[^:]+$/;
  const isCustomInferenceProfile = inferenceProfilePattern.test(updatedOptions?.model ?? '');

  if (
    extendedOptions.thinking &&
    updatedOptions?.model &&
    (isCustomInferenceProfile ||
      /claude-3[-.]7/.test(updatedOptions.model) ||
      /claude-(?:sonnet|opus|haiku)-[4-9]/.test(updatedOptions.model))
  ) {
    updatedOptions.thinking = {
      ...updatedOptions.thinking,
      type: 'enabled',
    } as { type: 'enabled'; budget_tokens: number };
  }

  if (
    updatedOptions.thinking != null &&
    extendedOptions.thinkingBudget != null &&
    updatedOptions.thinking.type === 'enabled'
  ) {
    updatedOptions.thinking = {
      ...updatedOptions.thinking,
      budget_tokens: extendedOptions.thinkingBudget,
    };
  }

  if (
    updatedOptions.thinking != null &&
    updatedOptions.thinking.type === 'enabled' &&
    (currentMaxTokens == null || updatedOptions.thinking.budget_tokens > currentMaxTokens)
  ) {
    const maxTokens = anthropicSettings.maxOutputTokens.reset(updatedOptions.model ?? '');
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

export { checkPromptCacheSupport, getClaudeHeaders, configureReasoning, isClaudeModelWithAdvancedFeatures };
