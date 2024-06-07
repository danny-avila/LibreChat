const bcrypt = require('bcryptjs');
const User = require('./User');

const hashPassword = async (password) => {
  const hashedPassword = await new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, function (err, hash) {
      if (err) {
        reject(err);
      } else {
        resolve(hash);
      }
    });
  });

  return hashedPassword;
};

/**
 * Retrieve a user by ID and convert the found user document to a plain object.
 *
 * @param {string} userId - The ID of the user to find and return as a plain object.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoUser>} A plain object representing the user document, or `null` if no user is found.
 */
const getUser = async function (userId, fieldsToSelect = null) {
  const query = User.findById(userId);

  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }

  return await query.lean();
};

/**
 * Update a user with new data without overwriting existing properties.
 *
 * @param {string} userId - The ID of the user to update.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<MongoUser>} The updated user document as a plain object, or `null` if no user is found.
 */
const updateUser = async function (userId, updateData) {
  return await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).lean();
};

/**
 * Creates a new user, optionally with a TTL of 1 week.
 * @param {MongoUser} data - The user data to be created, must contain user_id.
 * @param {boolean} [disableTTL=true] - Whether to disable the TTL. Defaults to `true`.
 * @returns {Promise<MongoUser>} A promise that resolves to the created user document.
 * @throws {Error} If a user with the same user_id already exists.
 */
const createUser = async (data, disableTTL = true) => {
  const userData = {
    ...data,
    expiresAt: new Date(Date.now() + 604800 * 1000), // 1 week in milliseconds
  };

  if (disableTTL) {
    delete userData.expiresAt;
  }

  try {
    const result = await User.collection.insertOne(userData);
    return result.ops[0];
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error code
      throw new Error(`User with \`_id\` ${data._id} already exists.`);
    } else {
      throw error;
    }
  }
};

/**
 * Count the number of user documents in the collection based on the provided filter.
 *
 * @param {Object} [filter={}] - The filter to apply when counting the documents.
 * @returns {Promise<number>} The count of documents that match the filter.
 */
const countUsers = async function (filter = {}) {
  return await User.countDocuments(filter);
};

module.exports = {
  hashPassword,
  countUsers,
  createUser,
  updateUser,
  getUser,
};
