import { logger } from '@librechat/data-schemas';
import type { CostTier } from 'librechat-data-provider';

export type FeatureKey = 'agents' | 'image_gen' | 'voice' | 'web_search';

export interface ModelEntry {
  cost_tier: CostTier;
  feature?: FeatureKey;
}

/**
 * Registry of known models → { cost_tier, feature? }, keyed by the curated
 * modelSpec `name` in `librechat.yaml` (not the raw provider model string).
 *
 * These are near-future model versions with no public per-token pricing to
 * verify against — tiers below are a best-guess from naming conventions
 * (mini/nano/lite/turbo/fast-non-reasoning = cheap, flagship generation =
 * mid, opus/pro/reasoning/multi-agent = expensive). Review and adjust once
 * real cost data is available.
 */
export const MODEL_REGISTRY: Record<string, ModelEntry> = {
  // Google — Gemini family
  'gemini-2.5-flash': { cost_tier: 'cheap' },
  'gemini-2.5-flash-lite': { cost_tier: 'cheap' },
  'gemini-3-flash-preview': { cost_tier: 'mid' },
  'gemini-3.1-pro-preview': { cost_tier: 'expensive' },

  // OpenAI — GPT-5 family
  'gpt-5.4-nano': { cost_tier: 'cheap' },
  'gpt-5.4-mini': { cost_tier: 'cheap' },
  'gpt-5.4': { cost_tier: 'mid' },
  'gpt-5.4-pro': { cost_tier: 'expensive' },
  'gpt-5.5': { cost_tier: 'expensive' },

  // Anthropic — Claude family
  'claude-haiku-4-5': { cost_tier: 'cheap' },
  'claude-sonnet-4-6': { cost_tier: 'mid' },
  'claude-sonnet-4-6-thinking': { cost_tier: 'expensive' },
  'claude-opus-4-5': { cost_tier: 'expensive' },
  'claude-opus-4-6': { cost_tier: 'expensive' },
  'claude-opus-4-7': { cost_tier: 'expensive' },
  'claude-opus-4-8': { cost_tier: 'expensive' },

  // xAI — Grok family
  'grok-4-1-fast': { cost_tier: 'cheap' },
  'grok-4.20-fast': { cost_tier: 'mid' },
  'grok-4.3': { cost_tier: 'expensive' },
  'grok-4.20-reasoning': { cost_tier: 'expensive' },
  'grok-4.20-multi-agent': { cost_tier: 'expensive' },

  // DeepSeek
  'deepseek-v4-flash': { cost_tier: 'cheap' },
  'deepseek-v4-pro': { cost_tier: 'mid' },

  // GLM
  'glm-5-turbo': { cost_tier: 'cheap' },
  'glm-5.2': { cost_tier: 'mid' },

  // Kimi / MiniMax
  'kimi-k2.6': { cost_tier: 'mid' },
  'minimax-m3': { cost_tier: 'mid' },
};

/** Returns the cost tier for a model ID. Falls back to 'mid' and warns for unknown models. */
export function getModelTier(modelId: string): CostTier {
  const entry = MODEL_REGISTRY[modelId];
  if (!entry) {
    logger.warn('[modelRegistry] unknown model, defaulting to mid tier', modelId);
    return 'mid';
  }
  return entry.cost_tier;
}
