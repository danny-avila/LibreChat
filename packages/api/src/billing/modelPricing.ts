// TODO(stage5): review pricing against provider invoices before launch
import { logger } from '@librechat/data-schemas';

type PricingEntry = { prompt_per_1k_cents: number; completion_per_1k_cents: number };

/** Per-model pricing in USD cents per 1 000 tokens. */
export const MODEL_PRICING: Record<string, PricingEntry> = {
  // OpenAI — GPT-5 family (anchored from spec §8.3)
  'gpt-5': { prompt_per_1k_cents: 0.5, completion_per_1k_cents: 1.5 },
  'gpt-5-mini': { prompt_per_1k_cents: 0.02, completion_per_1k_cents: 0.08 },
  'gpt-5-mini-high': { prompt_per_1k_cents: 0.08, completion_per_1k_cents: 0.32 },

  // Anthropic — Claude family (anchored from spec §8.3)
  'claude-opus-4-7': { prompt_per_1k_cents: 1.5, completion_per_1k_cents: 7.5 },
  'claude-opus-4-5': { prompt_per_1k_cents: 1.5, completion_per_1k_cents: 7.5 },
  'claude-sonnet-4-5': { prompt_per_1k_cents: 0.3, completion_per_1k_cents: 1.5 },
  'claude-haiku-4-5': { prompt_per_1k_cents: 0.08, completion_per_1k_cents: 0.4 },

  // Google — Gemini 2.5 family
  'gemini-2.5-pro': { prompt_per_1k_cents: 0.125, completion_per_1k_cents: 1.0 },
  'gemini-2.5-flash': { prompt_per_1k_cents: 0.015, completion_per_1k_cents: 0.06 },
  'gemini-2.5-flash-lite': { prompt_per_1k_cents: 0.0075, completion_per_1k_cents: 0.03 },

  // xAI — Grok family
  'grok-4': { prompt_per_1k_cents: 0.3, completion_per_1k_cents: 1.5 },
  'grok-3-mini': { prompt_per_1k_cents: 0.03, completion_per_1k_cents: 0.15 },

  // DeepSeek
  'deepseek-chat': { prompt_per_1k_cents: 0.027, completion_per_1k_cents: 0.11 },
  'deepseek-reasoner': { prompt_per_1k_cents: 0.055, completion_per_1k_cents: 0.219 },
};

/**
 * Estimates cost in cents for a model call.
 * Returns 0 for unknown models (and logs a warning) or zero-token calls.
 */
export function estimateCost(
  modelId: string,
  usage: { promptTokens: number; completionTokens: number },
): number {
  if (usage.promptTokens === 0 && usage.completionTokens === 0) return 0;

  const pricing = MODEL_PRICING[modelId];
  if (pricing === undefined) {
    logger.warn('[modelPricing] no pricing for model', modelId);
    return 0;
  }

  const cents =
    (usage.promptTokens / 1000) * pricing.prompt_per_1k_cents +
    (usage.completionTokens / 1000) * pricing.completion_per_1k_cents;

  return Math.round(cents);
}
