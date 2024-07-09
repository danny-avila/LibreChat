const mongoose = require('mongoose');
const assistantSchema = require('./schema/assistant');

const Assistant = mongoose.model('assistant', assistantSchema);

/**
 * Update an assistant with new data without overwriting existing properties,
 * or create a new assistant if it doesn't exist, within a transaction session if provided.
 *
 * @param {Object} searchParams - The search parameters to find the assistant to update.
 * @param {string} searchParams.assistant_id - The ID of the assistant to update.
 * @param {string} searchParams.user - The user ID of the assistant's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @param {mongoose.ClientSession} [session] - The transaction session to use (optional).
 * @returns {Promise<Object>} The updated or newly created assistant document as a plain object.
 */
const updateAssistantDoc = async (searchParams, updateData, session = null) => {
  const options = { new: true, upsert: true, session };
  return await Assistant.findOneAndUpdate(searchParams, updateData, options).lean();
};

/**
 * Retrieves an assistant document based on the provided ID.
 *
 * @param {Object} searchParams - The search parameters to find the assistant to update.
 * @param {string} searchParams.assistant_id - The ID of the assistant to update.
 * @param {string} searchParams.user - The user ID of the assistant's author.
 * @returns {Promise<Object|null>} The assistant document as a plain object, or null if not found.
 */
const getAssistant = async (searchParams) => await Assistant.findOne(searchParams).lean();

/**
 * Retrieves all assistants that match the given search parameters.
 *
 * @param {Object} searchParams - The search parameters to find matching assistants.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of action documents as plain objects.
 */
const getAssistants = async (searchParams) => {
  return await Assistant.find(searchParams).lean();
};

/**
 * Deletes an assistant based on the provided ID.
 *
 * @param {Object} searchParams - The search parameters to find the assistant to delete.
 * @param {string} searchParams.assistant_id - The ID of the assistant to delete.
 * @param {string} searchParams.user - The user ID of the assistant's author.
 * @returns {Promise<void>} Resolves when the assistant has been successfully deleted.
 */
const deleteAssistant = async (searchParams) => {
  return await Assistant.findOneAndDelete(searchParams);
};

module.exports = {
  updateAssistantDoc,
  deleteAssistant,
  getAssistants,
  getAssistant,
};
