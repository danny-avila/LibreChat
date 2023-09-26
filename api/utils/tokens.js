const models = [
  'text-davinci-003',
  'text-davinci-002',
  'text-davinci-001',
  'text-curie-001',
  'text-babbage-001',
  'text-ada-001',
  'davinci',
  'curie',
  'babbage',
  'ada',
  'code-davinci-002',
  'code-davinci-001',
  'code-cushman-002',
  'code-cushman-001',
  'davinci-codex',
  'cushman-codex',
  'text-davinci-edit-001',
  'code-davinci-edit-001',
  'text-embedding-ada-002',
  'text-similarity-davinci-001',
  'text-similarity-curie-001',
  'text-similarity-babbage-001',
  'text-similarity-ada-001',
  'text-search-davinci-doc-001',
  'text-search-curie-doc-001',
  'text-search-babbage-doc-001',
  'text-search-ada-doc-001',
  'code-search-babbage-code-001',
  'code-search-ada-code-001',
  'gpt2',
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
];

// Order is important here: by model series and context size (gpt-4 then gpt-3, ascending)
const maxTokensMap = {
  'gpt-4': 8191,
  'gpt-4-0613': 8191,
  'gpt-4-32k': 32767,
  'gpt-4-32k-0314': 32767,
  'gpt-4-32k-0613': 32767,
  'gpt-3.5-turbo': 4095,
  'gpt-3.5-turbo-0613': 4095,
  'gpt-3.5-turbo-0301': 4095,
  'gpt-3.5-turbo-16k': 15999,
  'gpt-3.5-turbo-16k-0613': 15999,
};

/**
 * Retrieves the maximum tokens for a given model name. If the exact model name isn't found,
 * it searches for partial matches within the model name, checking keys in reverse order.
 *
 * @param {string} modelName - The name of the model to look up.
 * @returns {number|undefined} The maximum tokens for the given model or undefined if no match is found.
 *
 * @example
 * getModelMaxTokens('gpt-4-32k-0613'); // Returns 32767
 * getModelMaxTokens('gpt-4-32k-unknown'); // Returns 32767
 * getModelMaxTokens('unknown-model'); // Returns undefined
 */
function getModelMaxTokens(modelName) {
  if (typeof modelName !== 'string') {
    return undefined;
  }

  if (maxTokensMap[modelName]) {
    return maxTokensMap[modelName];
  }

  const keys = Object.keys(maxTokensMap);
  for (let i = keys.length - 1; i >= 0; i--) {
    if (modelName.includes(keys[i])) {
      return maxTokensMap[keys[i]];
    }
  }

  return undefined;
}

module.exports = { tiktokenModels: new Set(models), maxTokensMap, getModelMaxTokens };
