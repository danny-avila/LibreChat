import { EModelEndpoint } from './schemas';

/**
 * Model context window token limits.
 * These values represent the maximum context tokens (input) for each model.
 * Values are slightly reduced from actual max to leave room for output tokens.
 */

const openAIModels: Record<string, number> = {
  'o4-mini': 200000,
  'o3-mini': 195000,
  o3: 200000,
  o1: 195000,
  'o1-mini': 127500,
  'o1-preview': 127500,
  'gpt-4': 8187,
  'gpt-4-0613': 8187,
  'gpt-4-32k': 32758,
  'gpt-4-32k-0314': 32758,
  'gpt-4-32k-0613': 32758,
  'gpt-4-1106': 127500,
  'gpt-4-0125': 127500,
  'gpt-4.5': 127500,
  'gpt-4.1': 1047576,
  'gpt-4.1-mini': 1047576,
  'gpt-4.1-nano': 1047576,
  'gpt-5': 400000,
  'gpt-5-mini': 400000,
  'gpt-5-nano': 400000,
  'gpt-5-pro': 400000,
  'gpt-4o': 127500,
  'gpt-4o-mini': 127500,
  'gpt-4o-2024-05-13': 127500,
  'gpt-4-turbo': 127500,
  'gpt-4-vision': 127500,
  'gpt-3.5-turbo': 16375,
  'gpt-3.5-turbo-0613': 4092,
  'gpt-3.5-turbo-0301': 4092,
  'gpt-3.5-turbo-16k': 16375,
  'gpt-3.5-turbo-16k-0613': 16375,
  'gpt-3.5-turbo-1106': 16375,
  'gpt-3.5-turbo-0125': 16375,
};

const mistralModels: Record<string, number> = {
  'mistral-': 31990,
  'mistral-7b': 31990,
  'mistral-small': 31990,
  'mixtral-8x7b': 31990,
  'mixtral-8x22b': 65536,
  'mistral-large': 131000,
  'mistral-large-2402': 127500,
  'mistral-large-2407': 127500,
  'mistral-nemo': 131000,
  'pixtral-large': 131000,
  'mistral-saba': 32000,
  codestral: 256000,
  'ministral-8b': 131000,
  'ministral-3b': 131000,
};

const cohereModels: Record<string, number> = {
  'command-light': 4086,
  'command-light-nightly': 8182,
  command: 4086,
  'command-nightly': 8182,
  'command-text': 4086,
  'command-r': 127500,
  'command-r-plus': 127500,
};

const googleModels: Record<string, number> = {
  gemma: 8196,
  'gemma-2': 32768,
  'gemma-3': 32768,
  'gemma-3-27b': 131072,
  gemini: 30720,
  'gemini-pro-vision': 12288,
  'gemini-exp': 2000000,
  'gemini-3': 1000000,
  'gemini-2.5': 1000000,
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000,
  'gemini-2.0': 2000000,
  'gemini-2.0-flash': 1000000,
  'gemini-2.0-flash-lite': 1000000,
  'gemini-1.5': 1000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-flash-8b': 1000000,
  'text-bison-32k': 32758,
  'chat-bison-32k': 32758,
  'code-bison-32k': 32758,
  'codechat-bison-32k': 32758,
  'code-': 6139,
  'codechat-': 6139,
  'text-': 8187,
  'chat-': 8187,
};

const anthropicModels: Record<string, number> = {
  'claude-': 100000,
  'claude-instant': 100000,
  'claude-2': 100000,
  'claude-2.1': 200000,
  'claude-3': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3.5-haiku': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3.7-sonnet': 200000,
  'claude-3-5-sonnet-latest': 200000,
  'claude-3.5-sonnet-latest': 200000,
  'claude-haiku-4-5': 200000,
  'claude-sonnet-4': 1000000,
  'claude-4': 200000,
  'claude-opus-4': 200000,
  'claude-opus-4-5': 200000,
};

const deepseekModels: Record<string, number> = {
  deepseek: 128000,
  'deepseek-chat': 128000,
  'deepseek-reasoner': 128000,
  'deepseek-r1': 128000,
  'deepseek-v3': 128000,
  'deepseek.r1': 128000,
};

const metaModels: Record<string, number> = {
  llama3: 8000,
  llama2: 4000,
  'llama-3': 8000,
  'llama-2': 4000,
  'llama3.1': 127500,
  'llama3.2': 127500,
  'llama3.3': 127500,
  'llama3-1': 127500,
  'llama3-2': 127500,
  'llama3-3': 127500,
  'llama-3.1': 127500,
  'llama-3.2': 127500,
  'llama-3.3': 127500,
  'llama3.1:405b': 127500,
  'llama3.1:70b': 127500,
  'llama3.1:8b': 127500,
  'llama3.2:1b': 127500,
  'llama3.2:3b': 127500,
  'llama3.2:11b': 127500,
  'llama3.2:90b': 127500,
  'llama3.3:70b': 127500,
  'llama3-1-405b': 127500,
  'llama3-1-70b': 127500,
  'llama3-1-8b': 127500,
  'llama3-2-1b': 127500,
  'llama3-2-3b': 127500,
  'llama3-2-11b': 127500,
  'llama3-2-90b': 127500,
  'llama3-3-70b': 127500,
  'llama-3.1-405b': 127500,
  'llama-3.1-70b': 127500,
  'llama-3.1-8b': 127500,
  'llama-3.2-1b': 127500,
  'llama-3.2-3b': 127500,
  'llama-3.2-11b': 127500,
  'llama-3.2-90b': 127500,
  'llama-3.3-70b': 127500,
  'llama3-70b': 8000,
  'llama3-8b': 8000,
  'llama2-70b': 4000,
  'llama2-13b': 4000,
  'llama3:70b': 8000,
  'llama3:8b': 8000,
  'llama2:70b': 4000,
};

const qwenModels: Record<string, number> = {
  qwen: 32000,
  'qwen2.5': 32000,
  'qwen-turbo': 1000000,
  'qwen-plus': 131000,
  'qwen-max': 32000,
  'qwq-32b': 32000,
  qwen3: 40960,
  'qwen3-8b': 128000,
  'qwen3-14b': 40960,
  'qwen3-30b-a3b': 40960,
  'qwen3-32b': 40960,
  'qwen3-235b-a22b': 40960,
  'qwen3-vl-8b-thinking': 256000,
  'qwen3-vl-8b-instruct': 262144,
  'qwen3-vl-30b-a3b': 262144,
  'qwen3-vl-235b-a22b': 131072,
  'qwen3-max': 256000,
  'qwen3-coder': 262144,
  'qwen3-coder-30b-a3b': 262144,
  'qwen3-coder-plus': 128000,
  'qwen3-coder-flash': 128000,
  'qwen3-next-80b-a3b': 262144,
};

const ai21Models: Record<string, number> = {
  'j2-mid': 8182,
  'j2-ultra': 8182,
  'jamba-instruct': 255500,
};

const amazonModels: Record<string, number> = {
  'titan-text-lite': 4000,
  'titan-text-express': 8000,
  'titan-text-premier': 31500,
  'nova-micro': 127000,
  'nova-lite': 295000,
  'nova-pro': 295000,
  'nova-premier': 995000,
};

const bedrockModels: Record<string, number> = {
  ...anthropicModels,
  ...mistralModels,
  ...cohereModels,
  ...deepseekModels,
  ...metaModels,
  ...ai21Models,
  ...amazonModels,
};

const xAIModels: Record<string, number> = {
  grok: 131072,
  'grok-beta': 131072,
  'grok-vision-beta': 8192,
  'grok-2': 131072,
  'grok-2-latest': 131072,
  'grok-2-1212': 131072,
  'grok-2-vision': 32768,
  'grok-2-vision-latest': 32768,
  'grok-2-vision-1212': 32768,
  'grok-3': 131072,
  'grok-3-fast': 131072,
  'grok-3-mini': 131072,
  'grok-3-mini-fast': 131072,
  'grok-4': 256000,
  'grok-4-fast': 2000000,
  'grok-4-1-fast': 2000000,
  'grok-code-fast': 256000,
};

const aggregateModels: Record<string, number> = {
  ...openAIModels,
  ...googleModels,
  ...bedrockModels,
  ...xAIModels,
  ...qwenModels,
  kimi: 131000,
  'gpt-oss': 131000,
  'gpt-oss:20b': 131000,
  'gpt-oss-20b': 131000,
  'gpt-oss:120b': 131000,
  'gpt-oss-120b': 131000,
  glm4: 128000,
  'glm-4': 128000,
  'glm-4-32b': 128000,
  'glm-4.5': 131000,
  'glm-4.5-air': 131000,
  'glm-4.5v': 66000,
  'glm-4.6': 200000,
};

/**
 * Map of endpoint to model context token limits.
 */
export const maxTokensMap: Record<string, Record<string, number>> = {
  [EModelEndpoint.azureOpenAI]: openAIModels,
  [EModelEndpoint.openAI]: aggregateModels,
  [EModelEndpoint.agents]: aggregateModels,
  [EModelEndpoint.custom]: aggregateModels,
  [EModelEndpoint.google]: googleModels,
  [EModelEndpoint.anthropic]: anthropicModels,
  [EModelEndpoint.bedrock]: bedrockModels,
};

/**
 * Finds the first matching pattern in the tokens map.
 * Searches in reverse order to match more specific patterns first.
 */
export function findMatchingPattern(
  modelName: string,
  tokensMap: Record<string, number>,
): string | null {
  const keys = Object.keys(tokensMap);
  const lowerModelName = modelName.toLowerCase();
  for (let i = keys.length - 1; i >= 0; i--) {
    const modelKey = keys[i];
    if (lowerModelName.includes(modelKey)) {
      return modelKey;
    }
  }
  return null;
}

/**
 * Retrieves the maximum context tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @returns The maximum context tokens for the given model or undefined if no match is found.
 *
 * @example
 * getModelMaxTokens('gpt-4o'); // Returns 127500
 * getModelMaxTokens('claude-3-opus', 'anthropic'); // Returns 200000
 * getModelMaxTokens('unknown-model'); // Returns undefined
 */
export function getModelMaxTokens(
  modelName: string,
  endpoint: string = EModelEndpoint.openAI,
): number | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  const tokensMap = maxTokensMap[endpoint];
  if (!tokensMap) {
    // Fall back to aggregate models for unknown endpoints
    return getModelMaxTokens(modelName, EModelEndpoint.openAI);
  }

  // Try exact match first
  if (tokensMap[modelName] !== undefined) {
    return tokensMap[modelName];
  }

  // Try pattern matching
  const matchedPattern = findMatchingPattern(modelName, tokensMap);
  if (matchedPattern) {
    return tokensMap[matchedPattern];
  }

  return undefined;
}

/**
 * Retrieves the model name key for a given model name input.
 * If the exact model name isn't found, it searches for partial matches.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @returns The model name key for the given model; returns input if no match is found.
 */
export function matchModelName(
  modelName: string,
  endpoint: string = EModelEndpoint.openAI,
): string | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  const tokensMap = maxTokensMap[endpoint];
  if (!tokensMap) {
    return modelName;
  }

  if (tokensMap[modelName] !== undefined) {
    return modelName;
  }

  const matchedPattern = findMatchingPattern(modelName, tokensMap);
  return matchedPattern || modelName;
}

// Individual model maps are available for advanced use cases
// but not re-exported to avoid conflicts with config.ts

// =============================================================================
// OUTPUT TOKEN LIMITS
// =============================================================================

/**
 * Maximum output tokens for OpenAI and similar models.
 * Values from official documentation, slightly reduced to leave safety margin.
 */
const modelMaxOutputs: Record<string, number> = {
  o1: 32268, // -500 from max: 32,768
  'o1-mini': 65136, // -500 from max: 65,536
  'o1-preview': 32268, // -500 from max: 32,768
  'gpt-5': 128000,
  'gpt-5-mini': 128000,
  'gpt-5-nano': 128000,
  'gpt-5-pro': 128000,
  'gpt-oss-20b': 131000,
  'gpt-oss-120b': 131000,
  system_default: 32000,
};

/**
 * Maximum output tokens for Anthropic Claude models.
 * Values from https://docs.anthropic.com/en/docs/about-claude/models/all-models#model-names
 */
const anthropicMaxOutputs: Record<string, number> = {
  'claude-3-haiku': 4096,
  'claude-3-sonnet': 4096,
  'claude-3-opus': 4096,
  'claude-haiku-4-5': 64000,
  'claude-sonnet-4': 64000,
  'claude-opus-4': 32000,
  'claude-opus-4-5': 64000,
  'claude-3.5-sonnet': 8192,
  'claude-3-5-sonnet': 8192,
  'claude-3.7-sonnet': 128000,
  'claude-3-7-sonnet': 128000,
};

/**
 * Maximum output tokens for DeepSeek models.
 * Values from https://api-docs.deepseek.com/quick_start/pricing
 */
const deepseekMaxOutputs: Record<string, number> = {
  deepseek: 8000, // deepseek-chat default: 4K, max: 8K
  'deepseek-chat': 8000,
  'deepseek-reasoner': 64000, // default: 32K, max: 64K
  'deepseek-r1': 64000,
  'deepseek-v3': 8000,
  'deepseek.r1': 64000,
};

/**
 * Map of endpoint to model max output token limits.
 */
export const maxOutputTokensMap: Record<string, Record<string, number>> = {
  [EModelEndpoint.anthropic]: anthropicMaxOutputs,
  [EModelEndpoint.azureOpenAI]: modelMaxOutputs,
  [EModelEndpoint.openAI]: { ...modelMaxOutputs, ...deepseekMaxOutputs },
  [EModelEndpoint.custom]: { ...modelMaxOutputs, ...deepseekMaxOutputs },
};

/**
 * Retrieves the maximum output tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @returns The maximum output tokens for the given model or undefined if no match is found.
 *
 * @example
 * getModelMaxOutputTokens('o1'); // Returns 32268
 * getModelMaxOutputTokens('claude-3-opus', 'anthropic'); // Returns 4096
 * getModelMaxOutputTokens('unknown-model'); // Returns 32000 (system_default)
 */
export function getModelMaxOutputTokens(
  modelName: string,
  endpoint: string = EModelEndpoint.openAI,
): number | undefined {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  const tokensMap = maxOutputTokensMap[endpoint];
  if (!tokensMap) {
    // Fall back to openAI for unknown endpoints
    return getModelMaxOutputTokens(modelName, EModelEndpoint.openAI);
  }

  // Try exact match first
  if (tokensMap[modelName] !== undefined) {
    return tokensMap[modelName];
  }

  // Try pattern matching
  const matchedPattern = findMatchingPattern(modelName, tokensMap);
  if (matchedPattern) {
    return tokensMap[matchedPattern];
  }

  // Return system_default if available
  return tokensMap.system_default;
}

// =============================================================================
// TOKEN DEFAULTS
// =============================================================================

/**
 * Centralized token-related default values.
 * These replace hardcoded magic numbers throughout the codebase.
 */
export const TOKEN_DEFAULTS = {
  /** Fallback context window for agents when model lookup fails */
  AGENT_CONTEXT_FALLBACK: 18000,
  /** Legacy fallback for older clients */
  LEGACY_CONTEXT_FALLBACK: 4097,
  /** Safety margin multiplier (0.9 = reserve 10% for response) */
  CONTEXT_SAFETY_MARGIN: 0.9,
  /** Default max output tokens when not specified */
  DEFAULT_MAX_OUTPUT: 32000,
} as const;
