/**
 * Client-side model pricing data
 * Prices are in USD per 1M tokens
 */

export interface ModelPricing {
  prompt: number;
  completion: number;
  cacheWrite?: number;
  cacheRead?: number;
  reasoning?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': { prompt: 5.0, completion: 15.0 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-4-turbo': { prompt: 10.0, completion: 30.0 },
  'gpt-4': { prompt: 30.0, completion: 60.0 },
  'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
  'o1': { prompt: 15.0, completion: 60.0, reasoning: 15.0 },
  'o1-mini': { prompt: 3.0, completion: 12.0, reasoning: 3.0 },
  'o1-preview': { prompt: 15.0, completion: 60.0, reasoning: 15.0 },

  // Anthropic Models
  'claude-3-5-sonnet': { prompt: 3.0, completion: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3.5-sonnet': { prompt: 3.0, completion: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3-5-haiku': { prompt: 0.8, completion: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
  'claude-3.5-haiku': { prompt: 0.8, completion: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
  'claude-3-opus': { prompt: 15.0, completion: 75.0 },
  'claude-3-sonnet': { prompt: 3.0, completion: 15.0 },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25, cacheWrite: 0.3, cacheRead: 0.03 },

  // Google Models
  'gemini-1.5-pro': { prompt: 2.5, completion: 10.0 },
  'gemini-1.5-flash': { prompt: 0.15, completion: 0.6 },
  'gemini-1.5-flash-8b': { prompt: 0.075, completion: 0.3 },
  'gemini-2.0-flash-exp': { prompt: 0.0, completion: 0.0 },
  'gemini-2.0-pro-exp': { prompt: 0.0, completion: 0.0 },

  // Add more models as needed...
};

/**
 * Calculate cost for a message based on token usage
 */
export function calculateMessageCost(
  model: string,
  promptTokens: number = 0,
  completionTokens: number = 0,
  additionalTokens?: {
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
    reasoningTokens?: number;
  }
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    console.warn(`No pricing data for model: ${model}`);
    return 0;
  }

  let cost = 0;

  // Calculate base costs
  cost += (promptTokens / 1_000_000) * pricing.prompt;
  cost += (completionTokens / 1_000_000) * pricing.completion;

  // Add additional token costs if applicable
  if (additionalTokens) {
    if (additionalTokens.cacheWriteTokens && pricing.cacheWrite) {
      cost += (additionalTokens.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
    }
    if (additionalTokens.cacheReadTokens && pricing.cacheRead) {
      cost += (additionalTokens.cacheReadTokens / 1_000_000) * pricing.cacheRead;
    }
    if (additionalTokens.reasoningTokens && pricing.reasoning) {
      cost += (additionalTokens.reasoningTokens / 1_000_000) * pricing.reasoning;
    }
  }

  return cost;
}

/**
 * Get color class based on cost
 */
export function getCostColor(cost: number): string {
  if (cost < 0.01) return 'text-green-600 dark:text-green-400';
  if (cost < 0.1) return 'text-yellow-600 dark:text-yellow-400';
  if (cost < 1.0) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}