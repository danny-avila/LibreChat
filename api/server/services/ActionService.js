const { getActions } = require('~/models/Action');

/**
 * Loads action sets based on the user and assistant ID.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {string} params.user - The user identifier.
 * @param {string} params.assistant_id - The assistant identifier.
 * @returns {Promise<Action[] | null>} A promise that resolves to an array of actions or `null` if no match.
 */
async function loadActionSets({ user, assistant_id }) {
  return await getActions({ user, assistant_id });
}

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {Action} params.action - The action set. Necessary for decrypting authentication values.
 * @param {ActionRequest} params.requestBuilder - The ActionRequest builder class to execute the API call.
 * @returns { { _call: (toolInput: Object) => unknown} } An object with `_call` method to execute the tool input.
 */
function createActionTool({ requestBuilder }) {
  const _call = async (toolInput) => {
    requestBuilder.setParams(toolInput);
    // TODO: auth handling
    const res = await requestBuilder.execute();
    if (typeof res.data === 'object') {
      return JSON.stringify(res.data);
    }
    return res.data;
  };

  return {
    _call,
  };
}

module.exports = {
  loadActionSets,
  createActionTool,
};
