const User = require('./User');

/**
 * Retrieve a user by ID and convert the found user document to a plain object.
 *
 * @param {string} userId - The ID of the user to find and return as a plain object.
 * @returns {Promise<Object>} A plain object representing the user document, or `null` if no user is found.
 */
const getUser = async function (userId) {
  return await User.findById(userId).lean();
};

/**
 * Update a user with new data without overwriting existing properties.
 *
 * @param {string} userId - The ID of the user to update.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<Object>} The updated user document as a plain object, or `null` if no user is found.
 */
const updateUser = async function (userId, updateData) {
  return await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).lean();
};

module.exports = {
  updateUser,
  getUser,
};
