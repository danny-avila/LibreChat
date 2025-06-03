const { Action } = require('~/db/models');

/**
 * Update an action with new data without overwriting existing properties,
 * or create a new action if it doesn't exist.
 *
 * @param {Object} searchParams - The search parameters to find the action to update.
 * @param {string} searchParams.action_id - The ID of the action to update.
 * @param {string} searchParams.user - The user ID of the action's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Action>} The updated or newly created action document as a plain object.
 */
const updateAction = async (searchParams, updateData) => {
  const options = { new: true, upsert: true };
  return await Action.findOneAndUpdate(searchParams, updateData, options).lean();
};

/**
 * Retrieves all actions that match the given search parameters.
 *
 * @param {Object} searchParams - The search parameters to find matching actions.
 * @param {boolean} includeSensitive - Flag to include sensitive data in the metadata.
 * @returns {Promise<Array<Action>>} A promise that resolves to an array of action documents as plain objects.
 */
const getActions = async (searchParams, includeSensitive = false) => {
  const actions = await Action.find(searchParams).lean();

  if (!includeSensitive) {
    for (let i = 0; i < actions.length; i++) {
      const metadata = actions[i].metadata;
      if (!metadata) {
        continue;
      }

      const sensitiveFields = ['api_key', 'oauth_client_id', 'oauth_client_secret'];
      for (let field of sensitiveFields) {
        if (metadata[field]) {
          delete metadata[field];
        }
      }
    }
  }

  return actions;
};

/**
 * Deletes an action by params.
 *
 * @param {Object} searchParams - The search parameters to find the action to delete.
 * @param {string} searchParams.action_id - The ID of the action to delete.
 * @param {string} searchParams.user - The user ID of the action's author.
 * @returns {Promise<Action>} A promise that resolves to the deleted action document as a plain object, or null if no document was found.
 */
const deleteAction = async (searchParams) => {
  return await Action.findOneAndDelete(searchParams).lean();
};

/**
 * Deletes actions by params.
 *
 * @param {Object} searchParams - The search parameters to find the actions to delete.
 * @param {string} searchParams.action_id - The ID of the action(s) to delete.
 * @param {string} searchParams.user - The user ID of the action's author.
 * @returns {Promise<Number>} A promise that resolves to the number of deleted action documents.
 */
const deleteActions = async (searchParams) => {
  const result = await Action.deleteMany(searchParams);
  return result.deletedCount;
};

module.exports = {
  getActions,
  updateAction,
  deleteAction,
  deleteActions,
};
