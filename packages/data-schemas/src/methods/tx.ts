/**
 * Token Pricing Configuration
 *
 * IMPORTANT: Key Ordering for Pattern Matching
 * ============================================
 * The `findMatchingPattern` function iterates through object keys in REVERSE order
 * (last-defined keys are checked first) and uses `modelName.includes(key)` for matching.
 *
 * This means:
 * 1. BASE PATTERNS must be defined FIRST (e.g., "kimi", "moonshot")
 * 2. SPECIFIC PATTERNS must be defined AFTER their base patterns (e.g., "kimi-k2", "kimi-k2.5")
 */

export interface TxDeps {
  /** From @librechat/api — matches a model name to a canonical key. */
  matchModelName: (model: string, endpoint?: string) => string | undefined;
  /** From @librechat/api — finds the first key in `values` whose key is a substring of `model`. */
  findMatchingPattern: (model: string, values: Record<string, unknown>) => string | undefined;
}

export const defaultRate = 6;

/** AWS Bedrock pricing (source: https://aws.amazon.com/bedrock/pricing/) */
const bedrockValues: Record<string, { prompt: number; completion: number }> = {
  llama2: { prompt: 0.75, completion: 1.0 },
  'llama-2': { prompt: 0.75, completion: 1.0 },
  'llama2-13b': { prompt: 0.75, completion: 1.0 },
  'llama2:70b': { prompt: 1.95, completion: 2.56 },
  'llama2-70b': { prompt: 1.95, completion: 2.56 },
  llama3: { prompt: 0.3, completion: 0.6 },
  'llama-3': { prompt: 0.3, completion: 0.6 },
  'llama3-8b': { prompt: 0.3, completion: 0.6 },
  'llama3:8b': { prompt: 0.3, completion: 0.6 },
  'llama3-70b': { prompt: 2.65, completion: 3.5 },
  'llama3:70b': { prompt: 2.65, completion: 3.5 },
  'llama3-1': { prompt: 0.22, completion: 0.22 },
  'llama3-1-8b': { prompt: 0.22, completion: 0.22 },
  'llama3-1-70b': { prompt: 0.72, completion: 0.72 },
  'llama3-1-405b': { prompt: 2.4, completion: 2.4 },
  'llama3-2': { prompt: 0.1, completion: 0.1 },
  'llama3-2-1b': { prompt: 0.1, completion: 0.1 },
  'llama3-2-3b': { prompt: 0.15, completion: 0.15 },
  'llama3-2-11b': { prompt: 0.16, completion: 0.16 },
  'llama3-2-90b': { prompt: 0.72, completion: 0.72 },
  'llama3-3': { prompt: 2.65, completion: 3.5 },
  'llama3-3-70b': { prompt: 2.65, completion: 3.5 },
  'llama3.1': { prompt: 0.22, completion: 0.22 },
  'llama3.1:8b': { prompt: 0.22, completion: 0.22 },
  'llama3.1:70b': { prompt: 0.72, completion: 0.72 },
  'llama3.1:405b': { prompt: 2.4, completion: 2.4 },
  'llama3.2': { prompt: 0.1, completion: 0.1 },
  'llama3.2:1b': { prompt: 0.1, completion: 0.1 },
  'llama3.2:3b': { prompt: 0.15, completion: 0.15 },
  'llama3.2:11b': { prompt: 0.16, completion: 0.16 },
  'llama3.2:90b': { prompt: 0.72, completion: 0.72 },
  'llama3.3': { prompt: 2.65, completion: 3.5 },
  'llama3.3:70b': { prompt: 2.65, completion: 3.5 },
  'llama-3.1': { prompt: 0.22, completion: 0.22 },
  'llama-3.1-8b': { prompt: 0.22, completion: 0.22 },
  'llama-3.1-70b': { prompt: 0.72, completion: 0.72 },
  'llama-3.1-405b': { prompt: 2.4, completion: 2.4 },
  'llama-3.2': { prompt: 0.1, completion: 0.1 },
  'llama-3.2-1b': { prompt: 0.1, completion: 0.1 },
  'llama-3.2-3b': { prompt: 0.15, completion: 0.15 },
  'llama-3.2-11b': { prompt: 0.16, completion: 0.16 },
  'llama-3.2-90b': { prompt: 0.72, completion: 0.72 },
  'llama-3.3': { prompt: 2.65, completion: 3.5 },
  'llama-3.3-70b': { prompt: 2.65, completion: 3.5 },
  'mistral-7b': { prompt: 0.15, completion: 0.2 },
  'mistral-small': { prompt: 0.15, completion: 0.2 },
  'mixtral-8x7b': { prompt: 0.45, completion: 0.7 },
  'mistral-large-2402': { prompt: 4.0, completion: 12.0 },
  'mistral-large-2407': { prompt: 3.0, completion: 9.0 },
  'command-text': { prompt: 1.5, completion: 2.0 },
  'command-light': { prompt: 0.3, completion: 0.6 },
  'j2-mid': { prompt: 12.5, completion: 12.5 },
  'j2-ultra': { prompt: 18.8, completion: 18.8 },
  'jamba-instruct': { prompt: 0.5, completion: 0.7 },
  'titan-text-lite': { prompt: 0.15, completion: 0.2 },
  'titan-text-express': { prompt: 0.2, completion: 0.6 },
  'titan-text-premier': { prompt: 0.5, completion: 1.5 },
  'nova-micro': { prompt: 0.035, completion: 0.14 },
  'nova-lite': { prompt: 0.06, completion: 0.24 },
  'nova-pro': { prompt: 0.8, completion: 3.2 },
  'nova-premier': { prompt: 2.5, completion: 12.5 },
  'deepseek.r1': { prompt: 1.35, completion: 5.4 },
  'moonshot.kimi': { prompt: 0.6, completion: 2.5 },
  'moonshot.kimi-k2': { prompt: 0.6, completion: 2.5 },
  'moonshot.kimi-k2.5': { prompt: 0.6, completion: 3.0 },
  'moonshot.kimi-k2-thinking': { prompt: 0.6, completion: 2.5 },
};

/**
 * Mapping of model token sizes to their respective multipliers for prompt and completion.
 * The rates are 1 USD per 1M tokens.
 */
export const tokenValues: Record<string, { prompt: number; completion: number }> = Object.assign(
  {
    '8k': { prompt: 30, completion: 60 },
    '32k': { prompt: 60, completion: 120 },
    '4k': { prompt: 1.5, completion: 2 },
    '16k': { prompt: 3, completion: 4 },
    'claude-': { prompt: 0.8, completion: 2.4 },
    deepseek: { prompt: 0.28, completion: 0.42 },
    command: { prompt: 0.38, completion: 0.38 },
    gemma: { prompt: 0.02, completion: 0.04 },
    gemini: { prompt: 0.5, completion: 1.5 },
    'gpt-oss': { prompt: 0.05, completion: 0.2 },
    'gpt-3.5-turbo-1106': { prompt: 1, completion: 2 },
    'gpt-3.5-turbo-0125': { prompt: 0.5, completion: 1.5 },
    'gpt-4-1106': { prompt: 10, completion: 30 },
    'gpt-4.1': { prompt: 2, completion: 8 },
    'gpt-4.1-nano': { prompt: 0.1, completion: 0.4 },
    'gpt-4.1-mini': { prompt: 0.4, completion: 1.6 },
    'gpt-4.5': { prompt: 75, completion: 150 },
    'gpt-4o': { prompt: 2.5, completion: 10 },
    'gpt-4o-2024-05-13': { prompt: 5, completion: 15 },
    'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
    'gpt-5': { prompt: 1.25, completion: 10 },
    'gpt-5.1': { prompt: 1.25, completion: 10 },
    'gpt-5.2': { prompt: 1.75, completion: 14 },
    'gpt-5-nano': { prompt: 0.05, completion: 0.4 },
    'gpt-5-mini': { prompt: 0.25, completion: 2 },
    'gpt-5-pro': { prompt: 15, completion: 120 },
    o1: { prompt: 15, completion: 60 },
    'o1-mini': { prompt: 1.1, completion: 4.4 },
    'o1-preview': { prompt: 15, completion: 60 },
    o3: { prompt: 2, completion: 8 },
    'o3-mini': { prompt: 1.1, completion: 4.4 },
    'o4-mini': { prompt: 1.1, completion: 4.4 },
    'claude-instant': { prompt: 0.8, completion: 2.4 },
    'claude-2': { prompt: 8, completion: 24 },
    'claude-2.1': { prompt: 8, completion: 24 },
    'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
    'claude-3-sonnet': { prompt: 3, completion: 15 },
    'claude-3-opus': { prompt: 15, completion: 75 },
    'claude-3-5-haiku': { prompt: 0.8, completion: 4 },
    'claude-3.5-haiku': { prompt: 0.8, completion: 4 },
    'claude-3-5-sonnet': { prompt: 3, completion: 15 },
    'claude-3.5-sonnet': { prompt: 3, completion: 15 },
    'claude-3-7-sonnet': { prompt: 3, completion: 15 },
    'claude-3.7-sonnet': { prompt: 3, completion: 15 },
    'claude-haiku-4-5': { prompt: 1, completion: 5 },
    'claude-opus-4': { prompt: 15, completion: 75 },
    'claude-opus-4-5': { prompt: 5, completion: 25 },
    'claude-opus-4-6': { prompt: 5, completion: 25 },
    'claude-sonnet-4': { prompt: 3, completion: 15 },
    'claude-sonnet-4-6': { prompt: 3, completion: 15 },
    'command-r': { prompt: 0.5, completion: 1.5 },
    'command-r-plus': { prompt: 3, completion: 15 },
    'command-text': { prompt: 1.5, completion: 2.0 },
    'deepseek-chat': { prompt: 0.28, completion: 0.42 },
    'deepseek-reasoner': { prompt: 0.28, completion: 0.42 },
    'deepseek-r1': { prompt: 0.4, completion: 2.0 },
    'deepseek-v3': { prompt: 0.2, completion: 0.8 },
    'gemma-2': { prompt: 0.01, completion: 0.03 },
    'gemma-3': { prompt: 0.02, completion: 0.04 },
    'gemma-3-27b': { prompt: 0.09, completion: 0.16 },
    'gemini-1.5': { prompt: 2.5, completion: 10 },
    'gemini-1.5-flash': { prompt: 0.15, completion: 0.6 },
    'gemini-1.5-flash-8b': { prompt: 0.075, completion: 0.3 },
    'gemini-2.0': { prompt: 0.1, completion: 0.4 },
    'gemini-2.0-flash': { prompt: 0.1, completion: 0.4 },
    'gemini-2.0-flash-lite': { prompt: 0.075, completion: 0.3 },
    'gemini-2.5': { prompt: 0.3, completion: 2.5 },
    'gemini-2.5-flash': { prompt: 0.3, completion: 2.5 },
    'gemini-2.5-flash-lite': { prompt: 0.1, completion: 0.4 },
    'gemini-2.5-pro': { prompt: 1.25, completion: 10 },
    'gemini-2.5-flash-image': { prompt: 0.15, completion: 30 },
    'gemini-3': { prompt: 2, completion: 12 },
    'gemini-3-pro-image': { prompt: 2, completion: 120 },
    'gemini-3.1': { prompt: 2, completion: 12 },
    'gemini-pro-vision': { prompt: 0.5, completion: 1.5 },
    grok: { prompt: 2.0, completion: 10.0 },
    'grok-beta': { prompt: 5.0, completion: 15.0 },
    'grok-vision-beta': { prompt: 5.0, completion: 15.0 },
    'grok-2': { prompt: 2.0, completion: 10.0 },
    'grok-2-1212': { prompt: 2.0, completion: 10.0 },
    'grok-2-latest': { prompt: 2.0, completion: 10.0 },
    'grok-2-vision': { prompt: 2.0, completion: 10.0 },
    'grok-2-vision-1212': { prompt: 2.0, completion: 10.0 },
    'grok-2-vision-latest': { prompt: 2.0, completion: 10.0 },
    'grok-3': { prompt: 3.0, completion: 15.0 },
    'grok-3-fast': { prompt: 5.0, completion: 25.0 },
    'grok-3-mini': { prompt: 0.3, completion: 0.5 },
    'grok-3-mini-fast': { prompt: 0.6, completion: 4 },
    'grok-4': { prompt: 3.0, completion: 15.0 },
    'grok-4-fast': { prompt: 0.2, completion: 0.5 },
    'grok-4-1-fast': { prompt: 0.2, completion: 0.5 },
    'grok-code-fast': { prompt: 0.2, completion: 1.5 },
    codestral: { prompt: 0.3, completion: 0.9 },
    'ministral-3b': { prompt: 0.04, completion: 0.04 },
    'ministral-8b': { prompt: 0.1, completion: 0.1 },
    'mistral-nemo': { prompt: 0.15, completion: 0.15 },
    'mistral-saba': { prompt: 0.2, completion: 0.6 },
    'pixtral-large': { prompt: 2.0, completion: 6.0 },
    'mistral-large': { prompt: 2.0, completion: 6.0 },
    'mixtral-8x22b': { prompt: 0.65, completion: 0.65 },
    kimi: { prompt: 0.6, completion: 2.5 },
    moonshot: { prompt: 2.0, completion: 5.0 },
    'kimi-latest': { prompt: 0.2, completion: 2.0 },
    'kimi-k2': { prompt: 0.6, completion: 2.5 },
    'kimi-k2.5': { prompt: 0.6, completion: 3.0 },
    'kimi-k2-turbo': { prompt: 1.15, completion: 8.0 },
    'kimi-k2-turbo-preview': { prompt: 1.15, completion: 8.0 },
    'kimi-k2-0905': { prompt: 0.6, completion: 2.5 },
    'kimi-k2-0905-preview': { prompt: 0.6, completion: 2.5 },
    'kimi-k2-0711': { prompt: 0.6, completion: 2.5 },
    'kimi-k2-0711-preview': { prompt: 0.6, completion: 2.5 },
    'kimi-k2-thinking': { prompt: 0.6, completion: 2.5 },
    'kimi-k2-thinking-turbo': { prompt: 1.15, completion: 8.0 },
    'moonshot-v1': { prompt: 2.0, completion: 5.0 },
    'moonshot-v1-auto': { prompt: 2.0, completion: 5.0 },
    'moonshot-v1-8k': { prompt: 0.2, completion: 2.0 },
    'moonshot-v1-8k-vision': { prompt: 0.2, completion: 2.0 },
    'moonshot-v1-8k-vision-preview': { prompt: 0.2, completion: 2.0 },
    'moonshot-v1-32k': { prompt: 1.0, completion: 3.0 },
    'moonshot-v1-32k-vision': { prompt: 1.0, completion: 3.0 },
    'moonshot-v1-32k-vision-preview': { prompt: 1.0, completion: 3.0 },
    'moonshot-v1-128k': { prompt: 2.0, completion: 5.0 },
    'moonshot-v1-128k-vision': { prompt: 2.0, completion: 5.0 },
    'moonshot-v1-128k-vision-preview': { prompt: 2.0, completion: 5.0 },
    'gpt-oss:20b': { prompt: 0.05, completion: 0.2 },
    'gpt-oss-20b': { prompt: 0.05, completion: 0.2 },
    'gpt-oss:120b': { prompt: 0.15, completion: 0.6 },
    'gpt-oss-120b': { prompt: 0.15, completion: 0.6 },
    glm4: { prompt: 0.1, completion: 0.1 },
    'glm-4': { prompt: 0.1, completion: 0.1 },
    'glm-4-32b': { prompt: 0.1, completion: 0.1 },
    'glm-4.5': { prompt: 0.35, completion: 1.55 },
    'glm-4.5-air': { prompt: 0.14, completion: 0.86 },
    'glm-4.5v': { prompt: 0.6, completion: 1.8 },
    'glm-4.6': { prompt: 0.5, completion: 1.75 },
    qwen: { prompt: 0.08, completion: 0.33 },
    'qwen2.5': { prompt: 0.08, completion: 0.33 },
    'qwen-turbo': { prompt: 0.05, completion: 0.2 },
    'qwen-plus': { prompt: 0.4, completion: 1.2 },
    'qwen-max': { prompt: 1.6, completion: 6.4 },
    'qwq-32b': { prompt: 0.15, completion: 0.4 },
    qwen3: { prompt: 0.035, completion: 0.138 },
    'qwen3-8b': { prompt: 0.035, completion: 0.138 },
    'qwen3-14b': { prompt: 0.05, completion: 0.22 },
    'qwen3-30b-a3b': { prompt: 0.06, completion: 0.22 },
    'qwen3-32b': { prompt: 0.05, completion: 0.2 },
    'qwen3-235b-a22b': { prompt: 0.08, completion: 0.55 },
    'qwen3-vl-8b-thinking': { prompt: 0.18, completion: 2.1 },
    'qwen3-vl-8b-instruct': { prompt: 0.18, completion: 0.69 },
    'qwen3-vl-30b-a3b': { prompt: 0.29, completion: 1.0 },
    'qwen3-vl-235b-a22b': { prompt: 0.3, completion: 1.2 },
    'qwen3-max': { prompt: 1.2, completion: 6 },
    'qwen3-coder': { prompt: 0.22, completion: 0.95 },
    'qwen3-coder-30b-a3b': { prompt: 0.06, completion: 0.25 },
    'qwen3-coder-plus': { prompt: 1, completion: 5 },
    'qwen3-coder-flash': { prompt: 0.3, completion: 1.5 },
    'qwen3-next-80b-a3b': { prompt: 0.1, completion: 0.8 },
  },
  bedrockValues,
);

/**
 * Mapping of model token sizes to their respective multipliers for cached input, read and write.
 * The rates are 1 USD per 1M tokens.
 */
export const cacheTokenValues: Record<string, { write: number; read: number }> = {
  'claude-3.7-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-7-sonnet': { write: 3.75, read: 0.3 },
  'claude-3.5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3.5-haiku': { write: 1, read: 0.08 },
  'claude-3-5-haiku': { write: 1, read: 0.08 },
  'claude-3-haiku': { write: 0.3, read: 0.03 },
  'claude-haiku-4-5': { write: 1.25, read: 0.1 },
  'claude-sonnet-4': { write: 3.75, read: 0.3 },
  'claude-sonnet-4-6': { write: 3.75, read: 0.3 },
  'claude-opus-4': { write: 18.75, read: 1.5 },
  'claude-opus-4-5': { write: 6.25, read: 0.5 },
  'claude-opus-4-6': { write: 6.25, read: 0.5 },
  deepseek: { write: 0.28, read: 0.028 },
  'deepseek-chat': { write: 0.28, read: 0.028 },
  'deepseek-reasoner': { write: 0.28, read: 0.028 },
  kimi: { write: 0.6, read: 0.15 },
  'kimi-k2': { write: 0.6, read: 0.15 },
  'kimi-k2.5': { write: 0.6, read: 0.1 },
  'kimi-k2-turbo': { write: 1.15, read: 0.15 },
  'kimi-k2-turbo-preview': { write: 1.15, read: 0.15 },
  'kimi-k2-0905': { write: 0.6, read: 0.15 },
  'kimi-k2-0905-preview': { write: 0.6, read: 0.15 },
  'kimi-k2-0711': { write: 0.6, read: 0.15 },
  'kimi-k2-0711-preview': { write: 0.6, read: 0.15 },
  'kimi-k2-thinking': { write: 0.6, read: 0.15 },
  'kimi-k2-thinking-turbo': { write: 1.15, read: 0.15 },
  // Gemini 3.1 models - cache read: $0.20/1M (<=200k), cache write: standard input price
  'gemini-3.1': { write: 2, read: 0.2 },
};

/**
 * Premium (tiered) pricing for models whose rates change based on prompt size.
 */
export const premiumTokenValues: Record<
  string,
  { threshold: number; prompt: number; completion: number }
> = {
  'claude-opus-4-6': { threshold: 200000, prompt: 10, completion: 37.5 },
  'claude-sonnet-4-6': { threshold: 200000, prompt: 6, completion: 22.5 },
  'gemini-3.1': { threshold: 200000, prompt: 4, completion: 18 },
};

export function createTxMethods(_mongoose: typeof import('mongoose'), txDeps: TxDeps) {
  const { matchModelName, findMatchingPattern } = txDeps;

  /**
   * Retrieves the key associated with a given model name.
   */
  function getValueKey(model: string, endpoint?: string): string | undefined {
    if (!model || typeof model !== 'string') {
      return undefined;
    }

    if (!endpoint || (typeof endpoint === 'string' && !tokenValues[endpoint])) {
      const matchedKey = findMatchingPattern(model, tokenValues);
      if (matchedKey) {
        return matchedKey;
      }
    }

    const modelName = matchModelName(model, endpoint);
    if (!modelName) {
      return undefined;
    }

    if (modelName.includes('gpt-3.5-turbo-16k')) {
      return '16k';
    } else if (modelName.includes('gpt-3.5')) {
      return '4k';
    } else if (modelName.includes('gpt-4-vision')) {
      return 'gpt-4-1106';
    } else if (modelName.includes('gpt-4-0125')) {
      return 'gpt-4-1106';
    } else if (modelName.includes('gpt-4-turbo')) {
      return 'gpt-4-1106';
    } else if (modelName.includes('gpt-4-32k')) {
      return '32k';
    } else if (modelName.includes('gpt-4')) {
      return '8k';
    }

    return undefined;
  }

  /**
   * Checks if premium (tiered) pricing applies and returns the premium rate.
   */
  function getPremiumRate(
    valueKey: string,
    tokenType: string,
    inputTokenCount?: number,
  ): number | null {
    if (inputTokenCount == null) {
      return null;
    }
    const premiumEntry = premiumTokenValues[valueKey];
    if (!premiumEntry || inputTokenCount <= premiumEntry.threshold) {
      return null;
    }
    return premiumEntry[tokenType as 'prompt' | 'completion'] ?? null;
  }

  /**
   * Retrieves the multiplier for a given value key and token type.
   */
  function getMultiplier({
    model,
    valueKey,
    endpoint,
    tokenType,
    inputTokenCount,
    endpointTokenConfig,
  }: {
    model?: string;
    valueKey?: string;
    endpoint?: string;
    tokenType?: 'prompt' | 'completion';
    inputTokenCount?: number;
    endpointTokenConfig?: Record<string, Record<string, number>>;
  }): number {
    if (endpointTokenConfig && model) {
      return endpointTokenConfig?.[model]?.[tokenType as string] ?? defaultRate;
    }

    if (valueKey && tokenType) {
      const premiumRate = getPremiumRate(valueKey, tokenType, inputTokenCount);
      if (premiumRate != null) {
        return premiumRate;
      }
      return tokenValues[valueKey]?.[tokenType] ?? defaultRate;
    }

    if (!tokenType || !model) {
      return 1;
    }

    valueKey = getValueKey(model, endpoint);
    if (!valueKey) {
      return defaultRate;
    }

    const premiumRate = getPremiumRate(valueKey, tokenType, inputTokenCount);
    if (premiumRate != null) {
      return premiumRate;
    }

    return tokenValues[valueKey]?.[tokenType] ?? defaultRate;
  }

  /**
   * Retrieves the cache multiplier for a given value key and token type.
   */
  function getCacheMultiplier({
    valueKey,
    cacheType,
    model,
    endpoint,
    endpointTokenConfig,
  }: {
    valueKey?: string;
    cacheType?: 'write' | 'read';
    model?: string;
    endpoint?: string;
    endpointTokenConfig?: Record<string, Record<string, number>>;
  }): number | null {
    if (endpointTokenConfig && model) {
      return endpointTokenConfig?.[model]?.[cacheType as string] ?? null;
    }

    if (valueKey && cacheType) {
      return cacheTokenValues[valueKey]?.[cacheType] ?? null;
    }

    if (!cacheType || !model) {
      return null;
    }

    valueKey = getValueKey(model, endpoint);
    if (!valueKey) {
      return null;
    }

    return cacheTokenValues[valueKey]?.[cacheType] ?? null;
  }

  return {
    tokenValues,
    premiumTokenValues,
    getValueKey,
    getMultiplier,
    getPremiumRate,
    getCacheMultiplier,
    defaultRate,
    cacheTokenValues,
  };
}

export type TxMethods = ReturnType<typeof createTxMethods>;
