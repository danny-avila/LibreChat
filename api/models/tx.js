const { matchModelName } = require('../utils');
const defaultRate = 6;

/** AWS Bedrock pricing */
const bedrockValues = {
  'anthropic.claude-3-haiku-20240307-v1:0': { prompt: 0.25, completion: 1.25 },
  'anthropic.claude-3-sonnet-20240229-v1:0': { prompt: 3.0, completion: 15.0 },
  'anthropic.claude-3-opus-20240229-v1:0': { prompt: 15.0, completion: 75.0 },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { prompt: 3.0, completion: 15.0 },
  'anthropic.claude-v2:1': { prompt: 8.0, completion: 24.0 },
  'anthropic.claude-instant-v1': { prompt: 0.8, completion: 2.4 },
  'meta.llama2-13b-chat-v1': { prompt: 0.75, completion: 1.0 },
  'meta.llama2-70b-chat-v1': { prompt: 1.95, completion: 2.56 },
  'meta.llama3-8b-instruct-v1:0': { prompt: 0.3, completion: 0.6 },
  'meta.llama3-70b-instruct-v1:0': { prompt: 2.65, completion: 3.5 },
  'meta.llama3-1-8b-instruct-v1:0': { prompt: 0.3, completion: 0.6 },
  'meta.llama3-1-70b-instruct-v1:0': { prompt: 2.65, completion: 3.5 },
  'meta.llama3-1-405b-instruct-v1:0': { prompt: 5.32, completion: 16.0 },
  'mistral.mistral-7b-instruct-v0:2': { prompt: 0.15, completion: 0.2 },
  'mistral.mistral-small-2402-v1:0': { prompt: 0.15, completion: 0.2 },
  'mistral.mixtral-8x7b-instruct-v0:1': { prompt: 0.45, completion: 0.7 },
  'mistral.mistral-large-2402-v1:0': { prompt: 4.0, completion: 12.0 },
  'mistral.mistral-large-2407-v1:0': { prompt: 3.0, completion: 9.0 },
  'cohere.command-text-v14': { prompt: 1.5, completion: 2.0 },
  'cohere.command-light-text-v14': { prompt: 0.3, completion: 0.6 },
  'cohere.command-r-v1:0': { prompt: 0.5, completion: 1.5 },
  'cohere.command-r-plus-v1:0': { prompt: 3.0, completion: 15.0 },
  'ai21.j2-mid-v1': { prompt: 12.5, completion: 12.5 },
  'ai21.j2-ultra-v1': { prompt: 18.8, completion: 18.8 },
  'amazon.titan-text-lite-v1': { prompt: 0.15, completion: 0.2 },
  'amazon.titan-text-express-v1': { prompt: 0.2, completion: 0.6 },
};

for (const [key, value] of Object.entries(bedrockValues)) {
  bedrockValues[`bedrock/${key}`] = value;
}

/**
 * Mapping of model token sizes to their respective multipliers for prompt and completion.
 * The rates are 1 USD per 1M tokens.
 * @type {Object.<string, {prompt: number, completion: number}>}
 */
const tokenValues = Object.assign(
  {
    '8k': { prompt: 30, completion: 60 },
    '32k': { prompt: 60, completion: 120 },
    '4k': { prompt: 1.5, completion: 2 },
    '16k': { prompt: 3, completion: 4 },
    'gpt-3.5-turbo-1106': { prompt: 1, completion: 2 },
    'gpt-4o-2024-08-06': { prompt: 2.5, completion: 10 },
    'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
    'gpt-4o': { prompt: 5, completion: 15 },
    'gpt-4-1106': { prompt: 10, completion: 30 },
    'gpt-3.5-turbo-0125': { prompt: 0.5, completion: 1.5 },
    'claude-3-opus': { prompt: 15, completion: 75 },
    'claude-3-sonnet': { prompt: 3, completion: 15 },
    'claude-3-5-sonnet': { prompt: 3, completion: 15 },
    'claude-3.5-sonnet': { prompt: 3, completion: 15 },
    'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
    'claude-2.1': { prompt: 8, completion: 24 },
    'claude-2': { prompt: 8, completion: 24 },
    'claude-': { prompt: 0.8, completion: 2.4 },
    'command-r-plus': { prompt: 3, completion: 15 },
    'command-r': { prompt: 0.5, completion: 1.5 },
    /* cohere doesn't have rates for the older command models,
  so this was from https://artificialanalysis.ai/models/command-light/providers */
    command: { prompt: 0.38, completion: 0.38 },
    'gemini-1.5': { prompt: 7, completion: 21 }, // May 2nd, 2024 pricing
    gemini: { prompt: 0.5, completion: 1.5 }, // May 2nd, 2024 pricing
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
  'claude-3.5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-5-sonnet': { write: 3.75, read: 0.3 },
  'claude-3-haiku': { write: 0.3, read: 0.03 },
};

/**
 * Retrieves the key associated with a given model name.
 *
 * @param {string} model - The model name to match.
 * @param {string} endpoint - The endpoint name to match.
 * @returns {string|undefined} The key corresponding to the model name, or undefined if no match is found.
 */
const getValueKey = (model, endpoint) => {
  const modelName = matchModelName(model, endpoint);
  if (!modelName) {
    return undefined;
  }

  if (modelName.includes('gpt-3.5-turbo-16k')) {
    return '16k';
  } else if (modelName.includes('gpt-3.5-turbo-0125')) {
    return 'gpt-3.5-turbo-0125';
  } else if (modelName.includes('gpt-3.5-turbo-1106')) {
    return 'gpt-3.5-turbo-1106';
  } else if (modelName.includes('gpt-3.5')) {
    return '4k';
  } else if (modelName.includes('gpt-4o-2024-08-06')) {
    return 'gpt-4o-2024-08-06';
  } else if (modelName.includes('gpt-4o-mini')) {
    return 'gpt-4o-mini';
  } else if (modelName.includes('gpt-4o')) {
    return 'gpt-4o';
  } else if (modelName.includes('gpt-4-vision')) {
    return 'gpt-4-1106';
  } else if (modelName.includes('gpt-4-1106')) {
    return 'gpt-4-1106';
  } else if (modelName.includes('gpt-4-0125')) {
    return 'gpt-4-1106';
  } else if (modelName.includes('gpt-4-turbo')) {
    return 'gpt-4-1106';
  } else if (modelName.includes('gpt-4-32k')) {
    return '32k';
  } else if (modelName.includes('gpt-4')) {
    return '8k';
  } else if (tokenValues[modelName]) {
    return modelName;
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

module.exports = { tokenValues, getValueKey, getMultiplier, getCacheMultiplier, defaultRate };
