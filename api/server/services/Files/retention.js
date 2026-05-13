const { getRetentionExpiry: getRetentionExpiryWithDeps } = require('@librechat/api');
const { logger, createTempChatExpirationDate } = require('@librechat/data-schemas');
const db = require('~/models');

/**
 * Returns `{ expiredAt }` when the request indicates data retention applies, otherwise `{}`.
 * Spread into file data objects before calling createFile.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getRetentionExpiry(req) {
  return getRetentionExpiryWithDeps(req, {
    getConvo: db.getConvoRetention ?? db.getConvo,
    createExpirationDate: createTempChatExpirationDate,
    logger,
  });
}

module.exports = {
  getRetentionExpiry,
};
