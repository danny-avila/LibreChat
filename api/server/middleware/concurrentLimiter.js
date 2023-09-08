const Keyv = require('keyv');
const crypto = require('crypto');

const { keyvMongo } = require('../../lib/db');
const { sendMessage, sendError } = require('../utils');
const { getResponseSender } = require('../routes/endpoints/schemas');
const { saveMessage } = require('../../models');

const { CONCURRENT_MESSAGE_MAX } = process.env ?? {};
const limit = Math.max(CONCURRENT_MESSAGE_MAX ?? 1, 1);

const pendingReqCache = new Keyv({ store: keyvMongo, namespace: 'pendingRequests' });
const violations = new Keyv({ store: keyvMongo, namespace: 'violations' });

/**
 * Middleware to limit concurrent requests for a user.
 *
 * This middleware checks if a user has exceeded a specified concurrent request limit.
 * If the user exceeds the limit, an error is returned. If the user is within the limit,
 * their request count is incremented. After the request is processed, the count is decremented.
 * If the `pendingReqCache` store is not available, the middleware will skip its logic.
 *
 * @function
 * @param {Object} req - Express request object containing user information.
 * @param {Object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @throws {Error} Throws an error if the user exceeds the concurrent request limit.
 */
const concurrentLimiter = async (req, res, next) => {
  if (!keyvMongo) {
    return next();
  }

  if (!pendingReqCache) {
    return next();
  }

  if (Object.keys(req?.body ?? {}).length === 1 && req?.body?.abortKey) {
    return next();
  }

  const userId = req.user.id;
  const pendingRequests = (await pendingReqCache.get(userId)) ?? 0;

  if (pendingRequests >= limit) {
    // User has pending requests over the limit
    await violations.set(`${userId}-${new Date().toLocaleString().replace(/ |, /g, ':')}`, {
      type: 'concurrent',
      limit,
      pendingRequests,
    });

    const { messageId, conversationId: _convoId, parentMessageId, text } = req.body;
    const conversationId = _convoId ?? crypto.randomUUID();

    const userMessage = {
      sender: 'User',
      messageId: messageId ?? crypto.randomUUID(),
      parentMessageId,
      conversationId,
      isCreatedByUser: true,
      text,
    };
    sendMessage(res, { message: userMessage, created: true });

    const shouldSaveMessage =
      _convoId && parentMessageId && parentMessageId !== '00000000-0000-0000-0000-000000000000';

    if (shouldSaveMessage) {
      await saveMessage(userMessage);
    }

    return await sendError(res, {
      sender: getResponseSender(req.body),
      messageId: crypto.randomUUID(),
      conversationId,
      parentMessageId: userMessage.messageId,
      text: `Only ${limit} message at a time. Please allow any other responses to complete before sending another message, or wait one minute.`,
      shouldSaveMessage,
    });
  } else {
    await pendingReqCache.set(userId, pendingRequests + 1);
  }

  // Ensure the requests are removed from the store once the request is done
  const cleanUp = async () => {
    if (!pendingReqCache) {
      return;
    }

    const currentRequests = await pendingReqCache.get(userId);

    if (currentRequests && currentRequests >= 1) {
      await pendingReqCache.set(userId, currentRequests - 1);
    } else {
      await pendingReqCache.delete(userId);
    }
  };

  if (pendingRequests < limit) {
    res.on('finish', cleanUp);
    res.on('close', cleanUp);
  }

  next();
};

process.on('exit', async () => {
  console.log('Clearing all pending requests before exiting...');
  await pendingReqCache.clear();
});

module.exports = concurrentLimiter;
