const { matchModelName } = require('../utils');

/**
 * Mapping of model token sizes to their respective multipliers for prompt and completion.
 * @type {Object.<string, {prompt: number, completion: number}>}
 */
const tokenValues = {
  '8k': { prompt: 3, completion: 6 },
  '32k': { prompt: 6, completion: 12 },
  '4k': { prompt: 1.5, completion: 2 },
  '16k': { prompt: 3, completion: 4 },
};

/**
 * Retrieves the key associated with a given model name.
 *
 * @param {string} model - The model name to match.
 * @returns {string|undefined} The key corresponding to the model name, or undefined if no match is found.
 */
const getValueKey = (model) => {
  const modelName = matchModelName(model);
  if (!modelName) {
    return undefined;
  }

  if (modelName.includes('gpt-3.5-turbo-16k')) {
    return '16k';
  } else if (modelName.includes('gpt-3.5')) {
    return '4k';
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
 * @param {string} [params.tokenType] - The type of token (e.g., 'prompt' or 'completion').
 * @param {string} [params.model] - The model name to derive the value key from if not provided.
 * @returns {number} The multiplier for the given parameters, or a default value if not found.
 */
const getMultiplier = ({ valueKey, tokenType, model }) => {
  if (valueKey && tokenType) {
    return tokenValues[valueKey][tokenType] ?? 4.5;
  }

  if (!tokenType || !model) {
    return 1;
  }

  valueKey = getValueKey(model);
  if (!valueKey) {
    return 4.5;
  }

  // If we got this far, and values[tokenType] is undefined somehow, return a rough average of default multipliers
  return tokenValues[valueKey][tokenType] ?? 4.5;
};

module.exports = { tokenValues, getValueKey, getMultiplier };
