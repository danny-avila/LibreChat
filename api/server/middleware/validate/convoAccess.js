const { isEnabled } = require('@librechat/api');
const { Constants, ViolationTypes, Time } = require('librechat-data-provider');
const denyRequest = require('~/server/middleware/denyRequest');
const { logViolation, getLogStores } = require('~/cache');
const { searchConversation } = require('~/models');

const { USE_REDIS, CONVO_ACCESS_VIOLATION_SCORE: score = 0 } = process.env ?? {};

/**
 * Helper function to get conversationId from different request body structures.
 * @param {Object} body - The request body.
 * @returns {string|undefined} The conversationId.
 */
const getConversationId = (body) => {
  return body.conversationId ?? body.arg?.conversationId;
};

/**
 * Middleware to validate user's authorization for a conversation.
 *
 * This middleware checks if a user has the right to access a specific conversation.
 * If the user doesn't have access, an error is returned. If the conversation doesn't exist,
 * a not found error is returned. If the access is valid, the middleware allows the request to proceed.
 * If the `cache` store is not available, the middleware will skip its logic.
 *
 * @function
 * @param {ServerRequest} req - Express request object containing user information.
 * @param {Express.Response} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @throws {Error} Throws an error if the user doesn't have access to the conversation.
 */
const validateConvoAccess = async (req, res, next) => {
  const namespace = ViolationTypes.CONVO_ACCESS;
  const cache = getLogStores(namespace);

  const conversationId = getConversationId(req.body);

  if (!conversationId || conversationId === Constants.NEW_CONVO) {
    return next();
  }

  const userId = req.user?.id ?? req.user?._id ?? '';
  const type = ViolationTypes.CONVO_ACCESS;
  const key = `${isEnabled(USE_REDIS) ? namespace : ''}:${userId}:${conversationId}`;

  try {
    if (cache) {
      const cachedAccess = await cache.get(key);
      if (cachedAccess === 'authorized') {
        return next();
      }
    }

    const conversation = await searchConversation(conversationId);

    if (!conversation) {
      return next();
    }

    if (conversation.user !== userId) {
      const errorMessage = {
        type,
        error: 'User not authorized for this conversation',
      };

      if (cache) {
        await logViolation(req, res, type, errorMessage, score);
      }
      return await denyRequest(req, res, errorMessage);
    }

    if (cache) {
      await cache.set(key, 'authorized', Time.TEN_MINUTES);
    }
    next();
  } catch (error) {
    console.error('Error validating conversation access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = validateConvoAccess;
