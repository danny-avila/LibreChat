const {
  getRetentionExpiry: getRetentionExpiryWithDeps,
  getAgentFileRetentionExpiry: getAgentFileRetentionExpiryWithDeps,
} = require('@librechat/api');
const {
  logger,
  createTempChatExpirationDate,
  createFileExpirationDate,
} = require('@librechat/data-schemas');
const db = require('~/models');

const getRetentionDependencies = () => ({
  getConvo: db.getConvoRetention ?? db.getConvo,
  createExpirationDate: createTempChatExpirationDate,
  logger,
});

const getFileRetentionDependencies = () => ({
  getConvo: db.getConvoRetention ?? db.getConvo,
  createExpirationDate: createFileExpirationDate,
  logger,
});

/**
 * Returns `{ expiredAt }` when the request indicates data retention applies, otherwise `{}`.
 * Spread into file data objects before calling createFile.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getRetentionExpiry(req) {
  return getRetentionExpiryWithDeps(req, getRetentionDependencies());
}

/**
 * Returns `{ expiredAt }` for file uploads when file retention is configured, otherwise
 * falls back to conversation/message retention behavior.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getFileRetentionExpiry(req) {
  return getRetentionExpiryWithDeps(req, getFileRetentionDependencies(), {
    applyFileRetention: true,
  });
}

/**
 * Returns `{ expiredAt }` for agent file uploads when retention applies, otherwise `{}`.
 * @param {object} params
 * @param {ServerRequest} params.req
 * @param {boolean} [params.messageAttachment]
 * @param {string} [params.tool_resource]
 * @param {string} [params.toolResource]
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getAgentFileRetentionExpiry({ tool_resource, toolResource, ...params }) {
  return getAgentFileRetentionExpiryWithDeps(
    { ...params, toolResource: tool_resource ?? toolResource },
    getFileRetentionDependencies(),
  );
}

module.exports = {
  getRetentionExpiry,
  getFileRetentionExpiry,
  getAgentFileRetentionExpiry,
};
