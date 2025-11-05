import { logger } from '@librechat/data-schemas';
import { AnthropicClientOptions } from '@librechat/agents';
import { EModelEndpoint, anthropicSettings } from 'librechat-data-provider';
import { matchModelName } from '~/utils/tokens';

/**
 * @param {string} modelName
 * @returns {boolean}
 */
function checkPromptCacheSupport(modelName: string): boolean {
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
 * Gets the appropriate headers for Claude models with cache control
 * @param {string} model The model name
 * @param {boolean} supportsCacheControl Whether the model supports cache control
 * @param {string} cacheDuration The cache duration ('5m' or '1h'). Defaults to '5m'
 * @returns {AnthropicClientOptions['extendedOptions']['defaultHeaders']|undefined} The headers object or undefined if not applicable
 */
function getClaudeHeaders(
  model: string,
  supportsCacheControl: boolean,
  cacheDuration: '5m' | '1h' = '5m',
): Record<string, string> | undefined {
  if (!supportsCacheControl) {
    return undefined;
  }

  const extendedCacheBeta = cacheDuration === '1h' ? 'extended-cache-ttl-2025-04-11,' : '';

  if (/claude-3[-.]5-sonnet/.test(model)) {
    return {
      'anthropic-beta': `${extendedCacheBeta}max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31`,
    };
  } else if (/claude-3[-.]7/.test(model)) {
    return {
      'anthropic-beta': `${extendedCacheBeta}token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31`,
    };
  } else if (/claude-sonnet-4[-.]5/.test(model) || /claude-4[-.]5-sonnet/.test(model)) {
    // Sonnet 4.5 specific headers
    return {
      'anthropic-beta': `${extendedCacheBeta}prompt-caching-2024-07-31,context-1m-2025-08-07`,
    };
  } else if (/claude-sonnet-4(?![-.]5)/.test(model)) {
    // Sonnet 4 (but not 4.5)
    return {
      'anthropic-beta': `${extendedCacheBeta}prompt-caching-2024-07-31,context-1m-2025-08-07`,
    };
  } else if (
    /claude-(?:sonnet|opus|haiku)-[4-9]/.test(model) ||
    /claude-[4-9]-(?:sonnet|opus|haiku)?/.test(model) ||
    /claude-4(?:-(?:sonnet|opus|haiku))?/.test(model)
  ) {
    return {
      'anthropic-beta': `${extendedCacheBeta}prompt-caching-2024-07-31`,
    };
  } else {
    return {
      'anthropic-beta': `${extendedCacheBeta}prompt-caching-2024-07-31`,
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

  if (
    extendedOptions.thinking &&
    updatedOptions?.model &&
    (/claude-3[-.]7/.test(updatedOptions.model) ||
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

export { checkPromptCacheSupport, getClaudeHeaders, configureReasoning };
