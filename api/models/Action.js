const mongoose = require('mongoose');
const actionSchema = require('./schema/action');

const Action = mongoose.model('action', actionSchema);

/**
 * Update an action with new data without overwriting existing properties,
 * or create a new action if it doesn't exist.
 *
 * @param {Object} searchParams - The search parameters to find the action to update.
 * @param {string} searchParams.action_id - The ID of the action to update.
 * @param {string} searchParams.user - The user ID of the action's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Object>} The updated or newly created action document as a plain object.
 */
const updateAction = async (searchParams, updateData) => {
  return await Action.findOneAndUpdate(searchParams, updateData, {
    new: true,
    upsert: true,
  }).lean();
};

module.exports = {
  updateAction,
};
