const tokenSchema = require('./schema/tokenSchema');
const mongoose = require('mongoose');
const { logger } = require('~/config');

/**
 * Token model.
 * @type {mongoose.Model}
 */
const Token = mongoose.model('Token', tokenSchema);

/**
 * Creates a new Token instance.
 * @param {Object} tokenData - The data for the new Token.
 * @param {mongoose.Types.ObjectId} tokenData.userId - The user's ID. It is required.
 * @param {String} tokenData.email - The user's email.
 * @param {String} tokenData.token - The token. It is required.
 * @param {Number} tokenData.expiresIn - The number of seconds until the token expires.
 * @returns {Promise<mongoose.Document>} The new Token instance.
 * @throws Will throw an error if token creation fails.
 */
async function createToken(tokenData) {
  const currentTime = new Date();
  const expiresAt = new Date(currentTime.getTime() + tokenData.expiresIn * 1000);

  const newTokenData = {
    ...tokenData,
    createdAt: currentTime,
    expiresAt,
  };

  return new Token(newTokenData).save();
}

/**
 * Finds a Token document that matches the provided query.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {String} query.email - The email of the user.
 * @returns {Promise<Object|null>} The matched Token document, or null if not found.
 * @throws Will throw an error if the find operation fails.
 */
function findToken(query) {
  return Token.findOne({
    $or: [{ userId: query.userId }, { token: query.token }, { email: query.email }],
  })
    .lean()
    .exec();
}

/**
 * Updates a Token document that matches the provided query.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {Object} updateData - The data to update the Token with.
 * @returns {Promise<mongoose.Document|null>} The updated Token document, or null if not found.
 * @throws Will throw an error if the update operation fails.
 */
function updateToken(query, updateData) {
  return Token.findOneAndUpdate(query, updateData, { new: true }).exec();
}

/**
 * Deletes all Token documents that match the provided token, user ID, or email.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {String} query.email - The email of the user.
 * @returns {Promise<Object>} The result of the delete operation.
 * @throws Will throw an error if the delete operation fails.
 */
async function deleteTokens(query) {
  return Token.deleteMany({
    $or: [{ userId: query.userId }, { token: query.token }, { email: query.email }],
  })
    .exec()
    .then((result) => {
      return result;
    })
    .catch((error) => {
      logger.debug('An error occurred while deleting tokens:', error);
      throw error;
    });
}

module.exports = {
  createToken,
  findToken,
  updateToken,
  deleteTokens,
};
