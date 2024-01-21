const mongoose = require('mongoose');
const assistantSchema = require('./schema/assistant');

const Assistant = mongoose.model('assistant', assistantSchema);

/**
 * Update an assistant with new data without overwriting existing properties,
 * or create a new assistant if it doesn't exist.
 *
 * @param {string} assistant_id - The ID of the assistant to update.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Object>} The updated or newly created assistant document as a plain object.
 */
const updateAssistant = async (assistant_id, updateData) => {
  return await Assistant.findOneAndUpdate({ assistant_id }, updateData, {
    new: true,
    upsert: true,
  }).lean();
};

module.exports = {
  updateAssistant,
};
