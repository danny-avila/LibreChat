const bcrypt = require('bcryptjs');
const signPayload = require('~/server/services/signPayload');
const User = require('./User');
const { logger } = require('~/config');
/**
 * Retrieve a user by ID and convert the found user document to a plain object.
 *
 * @param {string} userId - The ID of the user to find and return as a plain object.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoUser>} A plain object representing the user document, or `null` if no user is found.
 */
const getUserById = async function (userId, fieldsToSelect = null) {
  const query = User.findById(userId);

  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }

  return await query.lean();
};

/**
 * Search for a single user based on partial data and return matching user document as plain object.
 * @param {Partial<MongoUser>} searchCriteria - The partial data to use for searching the user.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoUser>} A plain object representing the user document, or `null` if no user is found.
 */
const findUser = async function (searchCriteria, fieldsToSelect = null) {
  const query = User.findOne(searchCriteria);
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
  const updateOperation = {
    $set: updateData,
    $unset: { expiresAt: '' }, // Remove the expiresAt field to prevent TTL
  };
  return await User.findByIdAndUpdate(userId, updateOperation, {
    new: true,
    runValidators: true,
  }).lean();
};

/**
 * Creates a new user, optionally with a TTL of 1 week.
 * @param {MongoUser} data - The user data to be created, must contain user_id.
 * @param {boolean} [disableTTL=true] - Whether to disable the TTL. Defaults to `true`.
 * @param {boolean} [returnUser=false] - Whether to disable the TTL. Defaults to `true`.
 * @returns {Promise<ObjectId>} A promise that resolves to the created user document ID.
 * @throws {Error} If a user with the same user_id already exists.
 */
const createUser = async (data, disableTTL = true, returnUser = false) => {
  const userData = {
    ...data,
    expiresAt: disableTTL ? null : new Date(Date.now() + 604800 * 1000), // 1 week in milliseconds
  };

  if (disableTTL) {
    delete userData.expiresAt;
  }

  const user = await User.create(userData);
  if (returnUser) {
    return user.toObject();
  }
  return user._id;
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

/**
 * Delete a user by their unique ID.
 *
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<{ deletedCount: number }>} An object indicating the number of deleted documents.
 */
const deleteUserById = async function (userId) {
  try {
    const result = await User.deleteOne({ _id: userId });
    if (result.deletedCount === 0) {
      return { deletedCount: 0, message: 'No user found with that ID.' };
    }
    return { deletedCount: result.deletedCount, message: 'User was deleted successfully.' };
  } catch (error) {
    throw new Error('Error deleting user: ' + error.message);
  }
};

const { SESSION_EXPIRY } = process.env ?? {};
const expires = eval(SESSION_EXPIRY) ?? 1000 * 60 * 15;

/**
 * Generates a JWT token for a given user.
 *
 * @param {MongoUser} user - ID of the user for whom the token is being generated.
 * @returns {Promise<string>} A promise that resolves to a JWT token.
 */
const generateToken = async (user) => {
  if (!user) {
    throw new Error('No user provided');
  }

  return await signPayload({
    payload: {
      id: user._id,
      username: user.username,
      provider: user.provider,
      email: user.email,
    },
    secret: process.env.JWT_SECRET,
    expirationTime: expires / 1000,
  });
};

/**
 * Compares the provided password with the user's password.
 *
 * @param {MongoUser} user - the user to compare password for.
 * @param {string} candidatePassword - The password to test against the user's password.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating if the password matches.
 */
const comparePassword = async (user, candidatePassword) => {
  if (!user) {
    throw new Error('No user provided');
  }

  return new Promise((resolve, reject) => {
    bcrypt.compare(candidatePassword, user.password, (err, isMatch) => {
      if (err) {
        reject(err);
      }
      resolve(isMatch);
    });
  });
};

/**
 * get users.
 *
 * @param {string} pageNumber
 * @param {string} pageSize
 * @returns {Promise<MongoUser[]>} .
 */
const getUsersByPage = async function (pageNumber = 1, pageSize = 25, searchKey = '') {
  try {
    const totalUser = (await User.countDocuments({})) || 1;
    const totalPages = Math.ceil(totalUser / pageSize);
    const regex = new RegExp(searchKey, 'i');
    const users = await User.find({
      $or: [
        { username: { $regex: regex } },
        { name: { $regex: regex } },
      ],
    })
      .sort({ updatedAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean();
    return { list: users, pages: totalPages, pageNumber, pageSize };
  } catch (error) {
    logger.error('[getUsersByPage] Error getting users', error);
    return { message: 'Error getting users' };
  }
};

module.exports = {
  comparePassword,
  deleteUserById,
  generateToken,
  getUserById,
  countUsers,
  createUser,
  updateUser,
  findUser,
  getUsersByPage,
};
