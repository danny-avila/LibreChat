import { logger } from '@librechat/data-schemas';
import { AnthropicClientOptions } from '@librechat/agents';
import { EModelEndpoint, anthropicSettings, TBetaFeatureFlags } from 'librechat-data-provider';
import { matchModelName } from '~/utils/tokens';

export interface BetaFeaturesConfig extends TBetaFeatureFlags {
  modelOverrides?: Record<string, TBetaFeatureFlags>;
}

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

function resolveFeatureFlag(
  feature: keyof TBetaFeatureFlags,
  model: string,
  config: BetaFeaturesConfig,
  defaultValue: boolean = true,
): boolean {
  const exactOverride = config.modelOverrides?.[model]?.[feature];
  if (exactOverride !== undefined) {
    return exactOverride;
  }

  for (const [pattern, flags] of Object.entries(config.modelOverrides ?? {})) {
    if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regex = new RegExp('^' + escaped + '$');
      if (regex.test(model) && flags[feature] !== undefined) {
        return flags[feature]!;
      }
    }
  }

  return config[feature] ?? defaultValue;
}

function getClaudeHeaders(
  model: string,
  supportsCacheControl: boolean,
  betaConfig: BetaFeaturesConfig = {},
): Record<string, string> | undefined {
  const features: string[] = [];

  if (/claude-3[-.]5-sonnet/.test(model) && resolveFeatureFlag('extendedMaxTokens', model, betaConfig)) {
    features.push('max-tokens-3-5-sonnet-2024-07-15');
  }

  if (/claude-3[-.]7/.test(model)) {
    if (resolveFeatureFlag('tokenEfficientTools', model, betaConfig)) {
      features.push('token-efficient-tools-2025-02-19');
    }
    if (resolveFeatureFlag('output128k', model, betaConfig)) {
      features.push('output-128k-2025-02-19');
    }
  }

  if (supportsCacheControl && resolveFeatureFlag('promptCaching', model, betaConfig)) {
    features.push('prompt-caching-2024-07-31');
  }

  if (/claude-sonnet-4/.test(model) && resolveFeatureFlag('context1m', model, betaConfig)) {
    features.push('context-1m-2025-08-07');
  }

  return features.length > 0 ? { 'anthropic-beta': features.join(',') } : undefined;
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

export {
  checkPromptCacheSupport,
  getClaudeHeaders,
  configureReasoning,
  resolveFeatureFlag,
};

export type { BetaFeaturesConfig };
