const { encryptV2 } = require('~/server/utils/crypto');
const db = require('~/lib/db/connectDb');

/**
 * Handles the OAuth token by creating or updating the token.
 * @param {object} fields
 * @param {string} fields.userId - The user's ID.
 * @param {string} fields.token - The full token to store.
 * @param {string} fields.identifier - Unique, alternative identifier for the token.
 * @param {number} fields.expiresIn - The number of seconds until the token expires.
 * @param {object} fields.metadata - Additional metadata to store with the token.
 * @param {string} [fields.type="oauth"] - The type of token. Default is 'oauth'.
 */
async function handleOAuthToken({
  token,
  userId,
  identifier,
  expiresIn,
  metadata,
  type = 'oauth',
}) {
  const encrypedToken = await encryptV2(token);
  const tokenData = {
    type,
    userId,
    metadata,
    identifier,
    token: encrypedToken,
    expiresIn: parseInt(expiresIn, 10) || 3600,
  };

  const { Token } = db.models;
  const existingToken = await Token.findToken({ userId, identifier });
  if (existingToken) {
    return await Token.updateToken({ identifier }, tokenData);
  } else {
    return await Token.createToken(tokenData);
  }
}

module.exports = {
  handleOAuthToken,
};
