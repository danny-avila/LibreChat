const { matchModelName, findMatchingPattern } = require('@librechat/api');
const defaultRate = 6;

/**
 * AWS Bedrock pricing
 * source: https://aws.amazon.com/bedrock/pricing/
 * */
const bedrockValues = {
  // Basic llama2 patterns (base defaults to smallest variant)
  llama2: { prompt: 0.75, completion: 1.0 },
  'llama-2': { prompt: 0.75, completion: 1.0 },
  'llama2-13b': { prompt: 0.75, completion: 1.0 },
  'llama2:70b': { prompt: 1.95, completion: 2.56 },
  'llama2-70b': { prompt: 1.95, completion: 2.56 },

  // Basic llama3 patterns (base defaults to smallest variant)
  llama3: { prompt: 0.3, completion: 0.6 },
  'llama-3': { prompt: 0.3, completion: 0.6 },
  'llama3-8b': { prompt: 0.3, completion: 0.6 },
  'llama3:8b': { prompt: 0.3, completion: 0.6 },
  'llama3-70b': { prompt: 2.65, completion: 3.5 },
  'llama3:70b': { prompt: 2.65, completion: 3.5 },

  // llama3-x-Nb pattern (base defaults to smallest variant)
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

  // llama3.x:Nb pattern (base defaults to smallest variant)
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

  // llama-3.x-Nb pattern (base defaults to smallest variant)
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
  // AI21 models
  'j2-mid': { prompt: 12.5, completion: 12.5 },
  'j2-ultra': { prompt: 18.8, completion: 18.8 },
  'jamba-instruct': { prompt: 0.5, completion: 0.7 },
  // Amazon Titan models
  'titan-text-lite': { prompt: 0.15, completion: 0.2 },
  'titan-text-express': { prompt: 0.2, completion: 0.6 },
  'titan-text-premier': { prompt: 0.5, completion: 1.5 },
  // Amazon Nova models
  'nova-micro': { prompt: 0.035, completion: 0.14 },
  'nova-lite': { prompt: 0.06, completion: 0.24 },
  'nova-pro': { prompt: 0.8, completion: 3.2 },
  'nova-premier': { prompt: 2.5, completion: 12.5 },
  'deepseek.r1': { prompt: 1.35, completion: 5.4 },
};

/**
 * Mapping of model token sizes to their respective multipliers for prompt and completion.
 * The rates are 1 USD per 1M tokens.
 * @type {Object.<string, {prompt: number, completion: number}>}
 */
const tokenValues = Object.assign(
  {
    // Legacy token size mappings (generic patterns - check LAST)
    '8k': { prompt: 30, completion: 60 },
    '32k': { prompt: 60, completion: 120 },
    '4k': { prompt: 1.5, completion: 2 },
    '16k': { prompt: 3, completion: 4 },
    // Generic fallback patterns (check LAST)
    'claude-': { prompt: 0.8, completion: 2.4 },
    deepseek: { prompt: 0.28, completion: 0.42 },
    command: { prompt: 0.38, completion: 0.38 },
    gemma: { prompt: 0.02, completion: 0.04 }, // Base pattern (using gemma-3n-e4b pricing)
    gemini: { prompt: 0.5, completion: 1.5 },
    'gpt-oss': { prompt: 0.05, completion: 0.2 },
    // Specific model variants (check FIRST - more specific patterns at end)
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
    'claude-sonnet-4': { prompt: 3, completion: 15 },
    'command-r': { prompt: 0.5, completion: 1.5 },
    'command-r-plus': { prompt: 3, completion: 15 },
    'command-text': { prompt: 1.5, completion: 2.0 },
    'deepseek-chat': { prompt: 0.28, completion: 0.42 },
    'deepseek-reasoner': { prompt: 0.28, completion: 0.42 },
    'deepseek-r1': { prompt: 0.4, completion: 2.0 },
    'deepseek-v3': { prompt: 0.2, completion: 0.8 },
    'gemma-2': { prompt: 0.01, completion: 0.03 }, // Base pattern (using gemma-2-9b pricing)
    'gemma-3': { prompt: 0.02, completion: 0.04 }, // Base pattern (using gemma-3n-e4b pricing)
    'gemma-3-27b': { prompt: 0.09, completion: 0.16 },
    'gemini-1.5': { prompt: 2.5, completion: 10 },
    'gemini-1.5-flash': { prompt: 0.15, completion: 0.6 },
    'gemini-1.5-flash-8b': { prompt: 0.075, completion: 0.3 },
    'gemini-2.0': { prompt: 0.1, completion: 0.4 }, // Base pattern (using 2.0-flash pricing)
    'gemini-2.0-flash': { prompt: 0.1, completion: 0.4 },
    'gemini-2.0-flash-lite': { prompt: 0.075, completion: 0.3 },
    'gemini-2.5': { prompt: 0.3, completion: 2.5 }, // Base pattern (using 2.5-flash pricing)
    'gemini-2.5-flash': { prompt: 0.3, completion: 2.5 },
    'gemini-2.5-flash-lite': { prompt: 0.1, completion: 0.4 },
    'gemini-2.5-pro': { prompt: 1.25, completion: 10 },
    'gemini-3': { prompt: 2, completion: 12 },
    'gemini-pro-vision': { prompt: 0.5, completion: 1.5 },
    grok: { prompt: 2.0, completion: 10.0 }, // Base pattern defaults to grok-2
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
    'grok-4-1-fast': { prompt: 0.2, completion: 0.5 }, // covers reasoning & non-reasoning variants
    'grok-code-fast': { prompt: 0.2, completion: 1.5 },
    codestral: { prompt: 0.3, completion: 0.9 },
    'ministral-3b': { prompt: 0.04, completion: 0.04 },
    'ministral-8b': { prompt: 0.1, completion: 0.1 },
    'mistral-nemo': { prompt: 0.15, completion: 0.15 },
    'mistral-saba': { prompt: 0.2, completion: 0.6 },
    'pixtral-large': { prompt: 2.0, completion: 6.0 },
    'mistral-large': { prompt: 2.0, completion: 6.0 },
    'mixtral-8x22b': { prompt: 0.65, completion: 0.65 },
    kimi: { prompt: 0.14, completion: 2.49 }, // Base pattern (using kimi-k2 pricing)
    // GPT-OSS models (specific sizes)
    'gpt-oss:20b': { prompt: 0.05, completion: 0.2 },
    'gpt-oss-20b': { prompt: 0.05, completion: 0.2 },
    'gpt-oss:120b': { prompt: 0.15, completion: 0.6 },
    'gpt-oss-120b': { prompt: 0.15, completion: 0.6 },
    // GLM models (Zhipu AI) - general to specific
    glm4: { prompt: 0.1, completion: 0.1 },
    'glm-4': { prompt: 0.1, completion: 0.1 },
    'glm-4-32b': { prompt: 0.1, completion: 0.1 },
    'glm-4.5': { prompt: 0.35, completion: 1.55 },
    'glm-4.5-air': { prompt: 0.14, completion: 0.86 },
    'glm-4.5v': { prompt: 0.6, completion: 1.8 },
    'glm-4.6': { prompt: 0.5, completion: 1.75 },
    // Qwen models
    qwen: { prompt: 0.08, completion: 0.33 }, // Qwen base pattern (using qwen2.5-72b pricing)
    'qwen2.5': { prompt: 0.08, completion: 0.33 }, // Qwen 2.5 base pattern
    'qwen-turbo': { prompt: 0.05, completion: 0.2 },
    'qwen-plus': { prompt: 0.4, completion: 1.2 },
    'qwen-max': { prompt: 1.6, completion: 6.4 },
    'qwq-32b': { prompt: 0.15, completion: 0.4 },
    // Qwen3 models
    qwen3: { prompt: 0.035, completion: 0.138 }, // Qwen3 base pattern (using qwen3-4b pricing)
    'qwen3-8b': { prompt: 0.035, completion: 0.138 },
    'qwen3-14b': { prompt: 0.05, completion: 0.22 },
    'qwen3-30b-a3b': { prompt: 0.06, completion: 0.22 },
    'qwen3-32b': { prompt: 0.05, completion: 0.2 },
    'qwen3-235b-a22b': { prompt: 0.08, completion: 0.55 },
    // Qwen3 VL (Vision-Language) models
    'qwen3-vl-8b-thinking': { prompt: 0.18, completion: 2.1 },
    'qwen3-vl-8b-instruct': { prompt: 0.18, completion: 0.69 },
    'qwen3-vl-30b-a3b': { prompt: 0.29, completion: 1.0 },
    'qwen3-vl-235b-a22b': { prompt: 0.3, completion: 1.2 },
    // Qwen3 specialized models
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
 * See Anthropic's documentation on this: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#pricing
 * The rates are 1 USD per 1M tokens.
 * @type {Object.<string, {write: number, read: number }>}
 */
const cacheTokenValues = {
  'claude-3.7-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-7-sonnet': { write: 3.75, read: 0.3 },
  'claude-3.5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3.5-haiku': { write: 1, read: 0.08 },
  'claude-3-5-haiku': { write: 1, read: 0.08 },
  'claude-3-haiku': { write: 0.3, read: 0.03 },
  'claude-haiku-4-5': { write: 1.25, read: 0.1 },
  'claude-sonnet-4': { write: 3.75, read: 0.3 },
  'claude-opus-4': { write: 18.75, read: 1.5 },
  'claude-opus-4-5': { write: 6.25, read: 0.5 },
  // DeepSeek models - cache hit: $0.028/1M, cache miss: $0.28/1M
  deepseek: { write: 0.28, read: 0.028 },
  'deepseek-chat': { write: 0.28, read: 0.028 },
  'deepseek-reasoner': { write: 0.28, read: 0.028 },
};

/**
 * Retrieves the key associated with a given model name.
 *
 * @param {string} model - The model name to match.
 * @param {string} endpoint - The endpoint name to match.
 * @returns {string|undefined} The key corresponding to the model name, or undefined if no match is found.
 */
const getValueKey = (model, endpoint) => {
  if (!model || typeof model !== 'string') {
    return undefined;
  }

  // Use findMatchingPattern directly against tokenValues for efficient lookup
  if (!endpoint || (typeof endpoint === 'string' && !tokenValues[endpoint])) {
    const matchedKey = findMatchingPattern(model, tokenValues);
    if (matchedKey) {
      return matchedKey;
    }
  }

  // Fallback: use matchModelName for edge cases and legacy handling
  const modelName = matchModelName(model, endpoint);
  if (!modelName) {
    return undefined;
  }

  // Legacy token size mappings and aliases for older models
  if (modelName.includes('gpt-3.5-turbo-16k')) {
    return '16k';
  } else if (modelName.includes('gpt-3.5')) {
    return '4k';
  } else if (modelName.includes('gpt-4-vision')) {
    return 'gpt-4-1106'; // Alias for gpt-4-vision
  } else if (modelName.includes('gpt-4-0125')) {
    return 'gpt-4-1106'; // Alias for gpt-4-0125
  } else if (modelName.includes('gpt-4-turbo')) {
    return 'gpt-4-1106'; // Alias for gpt-4-turbo
  } else if (modelName.includes('gpt-4-32k')) {
    return '32k';
  } else if (modelName.includes('gpt-4')) {
    return '8k';
  }

  return undefined;
};

/**
 * Retrieves the multiplier for a given value key and token type. If no value key is provided,
 * it attempts to derive it from the model name.
 *
 * @param {Object} params - The parameters for the function.
 * @param {string} [params.valueKey] - The key corresponding to the model name.
 * @param {'prompt' | 'completion'} [params.tokenType] - The type of token (e.g., 'prompt' or 'completion').
 * @param {string} [params.model] - The model name to derive the value key from if not provided.
 * @param {string} [params.endpoint] - The endpoint name to derive the value key from if not provided.
 * @param {EndpointTokenConfig} [params.endpointTokenConfig] - The token configuration for the endpoint.
 * @returns {number} The multiplier for the given parameters, or a default value if not found.
 */
const getMultiplier = ({ valueKey, tokenType, model, endpoint, endpointTokenConfig }) => {
  if (endpointTokenConfig) {
    return endpointTokenConfig?.[model]?.[tokenType] ?? defaultRate;
  }

  if (valueKey && tokenType) {
    return tokenValues[valueKey][tokenType] ?? defaultRate;
  }

  if (!tokenType || !model) {
    return 1;
  }

  valueKey = getValueKey(model, endpoint);
  if (!valueKey) {
    return defaultRate;
  }

  // If we got this far, and values[tokenType] is undefined somehow, return a rough average of default multipliers
  return tokenValues[valueKey]?.[tokenType] ?? defaultRate;
};

/**
 * Retrieves the cache multiplier for a given value key and token type. If no value key is provided,
 * it attempts to derive it from the model name.
 *
 * @param {Object} params - The parameters for the function.
 * @param {string} [params.valueKey] - The key corresponding to the model name.
 * @param {'write' | 'read'} [params.cacheType] - The type of token (e.g., 'write' or 'read').
 * @param {string} [params.model] - The model name to derive the value key from if not provided.
 * @param {string} [params.endpoint] - The endpoint name to derive the value key from if not provided.
 * @param {EndpointTokenConfig} [params.endpointTokenConfig] - The token configuration for the endpoint.
 * @returns {number | null} The multiplier for the given parameters, or `null` if not found.
 */
const getCacheMultiplier = ({ valueKey, cacheType, model, endpoint, endpointTokenConfig }) => {
  if (endpointTokenConfig) {
    return endpointTokenConfig?.[model]?.[cacheType] ?? null;
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

  // If we got this far, and values[cacheType] is undefined somehow, return a rough average of default multipliers
  return cacheTokenValues[valueKey]?.[cacheType] ?? null;
};

module.exports = {
  tokenValues,
  getValueKey,
  getMultiplier,
  getCacheMultiplier,
  defaultRate,
  cacheTokenValues,
};
