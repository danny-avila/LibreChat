const interchangeableKeys = new Map([
  ['chatGptLabel', ['modelLabel']],
  ['modelLabel', ['chatGptLabel']],
]);

/**
 * Middleware to enforce the model spec for a conversation
 * @param {TModelSpec} modelSpec - The model spec to enforce
 * @param {TConversation} parsedBody - The parsed body of the conversation
 * @returns {boolean} - Whether the model spec is enforced
 */
const enforceModelSpec = (modelSpec, parsedBody) => {
  for (const [key, value] of Object.entries(modelSpec.preset)) {
    if (key === 'endpoint') {
      continue;
    }

    if (!checkMatch(key, value, parsedBody)) {
      return false;
    }
  }
  return true;
};

/**
 * Checks if there is a match for the given key and value in the parsed body
 * or any of its interchangeable keys.
 * @param {string} key
 * @param {any} value
 * @param {TConversation} parsedBody
 * @returns {boolean}
 */
const checkMatch = (key, value, parsedBody) => {
  if (parsedBody[key] === value) {
    return true;
  }

  if (interchangeableKeys.has(key)) {
    return interchangeableKeys
      .get(key)
      .some((interchangeableKey) => parsedBody[interchangeableKey] === value);
  }

  return false;
};

module.exports = enforceModelSpec;
