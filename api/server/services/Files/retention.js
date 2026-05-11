const { RetentionMode } = require('librechat-data-provider');
const { logger, createTempChatExpirationDate } = require('@librechat/data-schemas');
const db = require('~/models');

const isTruthy = (value) => value === true || value === 'true';

const getConversationExpirationDate = (convo) => {
  if (convo?.expiredAt == null) {
    return null;
  }

  const expiredAt = convo.expiredAt instanceof Date ? convo.expiredAt : new Date(convo.expiredAt);
  return Number.isNaN(expiredAt.getTime()) ? null : expiredAt;
};

const isActiveExpirationDate = (expiredAt) => expiredAt > new Date();

function createRetentionExpiry(req) {
  try {
    return { expiredAt: createTempChatExpirationDate(req.config?.interfaceConfig) };
  } catch (err) {
    logger.error('[getRetentionExpiry] Error creating file expiration date:', err);
    return { expiredAt: null };
  }
}

/**
 * Returns `{ expiredAt }` when the request indicates data retention applies, otherwise `{}`.
 * Spread into file data objects before calling createFile.
 * @param {ServerRequest} req
 * @returns {Promise<{ expiredAt?: Date | null }>}
 */
async function getRetentionExpiry(req) {
  if (req?.config?.interfaceConfig?.retentionMode === RetentionMode.ALL) {
    return createRetentionExpiry(req);
  }

  const conversationId = req?.body?.conversationId;
  if (conversationId && req?.user?.id) {
    try {
      const convo = await db.getConvo(req.user.id, conversationId);
      if (convo) {
        const expiredAt = getConversationExpirationDate(convo);
        if (expiredAt == null) {
          return {};
        }

        if (!isActiveExpirationDate(expiredAt)) {
          return { expiredAt };
        }

        return createRetentionExpiry(req);
      }
    } catch (err) {
      logger.error('[getRetentionExpiry] Error checking conversation retention:', err);
    }
  }

  if (!isTruthy(req?.body?.isTemporary)) {
    return {};
  }

  return createRetentionExpiry(req);
}

module.exports = {
  getRetentionExpiry,
};
