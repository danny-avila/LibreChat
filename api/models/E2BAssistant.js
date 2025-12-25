const { E2BAssistant } = require('~/db/models');

/**
 * Create a new E2B assistant document.
 * 
 * @param {Object} data - The assistant data.
 * @returns {Promise<Object>} The created assistant document.
 */
const createE2BAssistantDoc = async (data) => {
  return await E2BAssistant.create(data);
};

/**
 * Update an E2B assistant with new data without overwriting existing properties,
 * or create a new assistant if it doesn't exist.
 *
 * @param {Object} searchParams - The search parameters to find the assistant to update.
 * @param {string} searchParams.id - The ID of the assistant to update.
 * @param {string} searchParams.author - The user ID of the assistant's author.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Object>} The updated or newly created assistant document as a plain object.
 */
const updateE2BAssistantDoc = async (searchParams, updateData) => {
  const options = { new: true, upsert: true };
  return await E2BAssistant.findOneAndUpdate(searchParams, updateData, options).lean();
};

/**
 * Retrieves an E2B assistant document based on the provided search parameters.
 *
 * @param {Object} searchParams - The search parameters to find the assistant.
 * @returns {Promise<Object|null>} The assistant document as a plain object, or null if not found.
 */
const getE2BAssistantDoc = async (searchParams) => await E2BAssistant.findOne(searchParams).lean();

/**
 * Retrieves all E2B assistants that match the given search parameters.
 *
 * @param {Object} searchParams - The search parameters to find matching assistants.
 * @param {Object} [select] - Optional. Specifies which document fields to include or exclude.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of assistant documents as plain objects.
 */
const getE2BAssistantDocs = async (searchParams, select = null) => {
  let query = E2BAssistant.find(searchParams);

  if (select) {
    query = query.select(select);
  }

  return await query.lean();
};

/**
 * Deletes an E2B assistant based on the provided search parameters.
 *
 * @param {Object} searchParams - The search parameters to find the assistant to delete.
 * @returns {Promise<Object>} Resolves when the assistant has been successfully deleted.
 */
const deleteE2BAssistantDoc = async (searchParams) => {
  return await E2BAssistant.findOneAndDelete(searchParams);
};

module.exports = {
  createE2BAssistantDoc,
  updateE2BAssistantDoc,
  deleteE2BAssistantDoc,
  getE2BAssistantDocs,
  getE2BAssistantDoc,
};
