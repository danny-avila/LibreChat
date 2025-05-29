const { encryptV2 } = require('~/server/utils/crypto');
const { logger } = require('~/config');
const db = require('~/lib/db/connectDb');
/**
 * Fixes the indexes for the Token collection from legacy TTL indexes to the new expiresAt index.
 */
async function fixIndexes() {
  try {
    if (
      process.env.NODE_ENV === 'CI' ||
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }
    const indexes = await db.models.Token.collection.indexes();
    logger.debug('Existing Token Indexes:', JSON.stringify(indexes, null, 2));
    const unwantedTTLIndexes = indexes.filter(
      (index) => index.key.createdAt === 1 && index.expireAfterSeconds !== undefined,
    );
    if (unwantedTTLIndexes.length === 0) {
      logger.debug('No unwanted Token indexes found.');
      return;
    }
    for (const index of unwantedTTLIndexes) {
      logger.debug(`Dropping unwanted Token index: ${index.name}`);
      await db.models.Token.collection.dropIndex(index.name);
      logger.debug(`Dropped Token index: ${index.name}`);
    }
    logger.debug('Token index cleanup completed successfully.');
  } catch (error) {
    logger.error('An error occurred while fixing Token indexes:', error);
  }
}

fixIndexes();

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

  const {Token} = db.models;
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
