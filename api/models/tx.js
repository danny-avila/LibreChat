const { matchModelName } = require('../utils');
const defaultRate = 6;

/**
 * Mapping of model token sizes to their respective multipliers for prompt and completion.
 * The rates are 1 USD per 1M tokens.
 * @type {Object.<string, {prompt: number, completion: number}>}
 */
const tokenValues = {
  '8k': { prompt: 30, completion: 60 },
  '32k': { prompt: 60, completion: 120 },
  '4k': { prompt: 1.5, completion: 2 },
  '16k': { prompt: 3, completion: 4 },
  'gpt-3.5-turbo-1106': { prompt: 1, completion: 2 },
  'gpt-4-1106': { prompt: 10, completion: 30 },
  'gpt-3.5-turbo-0125': { prompt: 0.5, completion: 1.5 },
  'claude-3-opus': { prompt: 15, completion: 75 },
  'claude-3-sonnet': { prompt: 3, completion: 15 },
  'claude-3-haiku': { prompt: 0.25, completion: 1.25 },
  'claude-2.1': { prompt: 8, completion: 24 },
  'claude-2': { prompt: 8, completion: 24 },
  'claude-': { prompt: 0.8, completion: 2.4 },
  'command-r-plus': { prompt: 3, completion: 15 },
  'command-r': { prompt: 0.5, completion: 1.5 },
  /* cohere doesn't have rates for the older command models,
  so this was from https://artificialanalysis.ai/models/command-light/providers */
  command: { prompt: 0.38, completion: 0.38 },
  // 'gemini-1.5': { prompt: 7, completion: 21 }, // May 2nd, 2024 pricing
  // 'gemini': { prompt: 0.5, completion: 1.5 }, // May 2nd, 2024 pricing
  'gemini-1.5': { prompt: 0, completion: 0 }, // currently free
  gemini: { prompt: 0, completion: 0 }, // currently free
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
 * @param {string} [params.tokenType] - The type of token (e.g., 'prompt' or 'completion').
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
  return tokenValues[valueKey][tokenType] ?? defaultRate;
};

module.exports = { tokenValues, getValueKey, getMultiplier, defaultRate };
