const { handleError } = require('../utils');
const { CONCURRENT_MESSAGE_LIMIT, MONGO_URI } = process.env ?? {};
const limit = CONCURRENT_MESSAGE_LIMIT ?? 1;
const KeyvMongo = require('@keyv/mongo');
const Keyv = require('keyv');

const keyvMongo = new KeyvMongo(MONGO_URI, { collection: 'cache' });
keyvMongo.on('error', (err) => console.error('KeyvMongo connection error:', err));

/**
 * Middleware to limit concurrent requests for a user.
 *
 * This middleware checks if a user has exceeded a specified concurrent request limit.
 * If the user exceeds the limit, an error is returned. If the user is within the limit,
 * their request count is incremented. After the request is processed, the count is decremented.
 * If the `pendingRequests` store is not available, the middleware will skip its logic.
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

  if (Object.keys(req?.body ?? {}).length === 1 && req?.body?.abortKey) {
    return next();
  }

  const userId = req.user.id;
  const keyv = new Keyv({ store: keyvMongo, ttlSupport: true, namespace: 'pendingRequests' });
  const pendingRequest = await keyv.get(userId);

  if (pendingRequest && pendingRequest >= limit) {
    // User already has a pending request
    return handleError(res, `Only ${limit} request(s) allowed at a time.`);
  } else if (pendingRequest) {
    // User has a pending request, increment the count
    await keyv.set(userId, pendingRequest + 1, 60 * 1000);
  } else {
    // User has no pending requests, set the count to 1
    await keyv.set(userId, 1, 60 * 1000);
  }

  // Ensure the user is removed from the store once the request is done
  const cleanUp = async () => {
    if (!keyv) {
      return;
    }

    const currentPending = await keyv.get(userId);
    if (!currentPending) {
      return;
    }
    if (currentPending > 1) {
      await keyv.set(userId, currentPending - 1, 60 * 1000);
    } else {
      await keyv.delete(userId);
    }
  };

  res.on('finish', cleanUp);
  res.on('close', cleanUp);

  next();
};

module.exports = concurrentLimiter;
