const { getRetentionExpiry: getRetentionExpiryWithDeps } = require('@librechat/api');
const {
  logger,
  createFileExpirationDate,
  createTempChatExpirationDate,
} = require('@librechat/data-schemas');
const db = require('~/models');

/**
 * Returns `{ expiredAt }` when the request indicates data retention applies, otherwise `{}`.
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

/**
 * Returns `{ expiredAt }` for uploaded files when retention is enabled.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getFileRetentionExpiry(req) {
  return getRetentionExpiryWithDeps(
    req,
    {
      getConvo: db.getConvoRetention ?? db.getConvo,
      createExpirationDate: createFileExpirationDate,
      logger,
    },
    { applyFileRetention: true },
  );
}

module.exports = {
  getRetentionExpiry,
  getFileRetentionExpiry,
};
