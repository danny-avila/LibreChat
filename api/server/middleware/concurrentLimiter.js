const Keyv = require('keyv');
const { handleError } = require('../utils');
const { keyvMongo } = require('../../lib/db');
const { CONCURRENT_MESSAGE_MAX } = process.env ?? {};
const limit = Math.max(CONCURRENT_MESSAGE_MAX ?? 1, 1);

const pendingRequests = new Keyv({ store: keyvMongo, namespace: 'pendingRequests' });
const violations = new Keyv({ store: keyvMongo, namespace: 'violations' });

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

  if (!pendingRequests) {
    return next();
  }

  if (Object.keys(req?.body ?? {}).length === 1 && req?.body?.abortKey) {
    return next();
  }

  const userId = req.user.id;
  const pendingRequest = await pendingRequests.get(userId);

  if (pendingRequest && pendingRequest >= limit) {
    // User already has a pending request
    await violations.set(
      `${userId}-${new Date().toLocaleString().replace(/ |, /g, ':')}`,
      `Exceeded concurrent message limit, ${pendingRequest} pending requests`,
    );
    await pendingRequests.set(userId, pendingRequest + 1);
    return handleError(res, `Only ${limit} request(s) allowed at a time.`);
  } else if (pendingRequest) {
    // User has a pending request, increment the count
    await pendingRequests.set(userId, pendingRequest + 1);
  } else {
    // User has no pending requests, set the count to 1
    await pendingRequests.set(userId, 1);
  }

  // Ensure the user is removed from the store once the request is done
  const cleanUp = async () => {
    if (!pendingRequests) {
      return;
    }

    await pendingRequests.delete(userId);
  };

  res.on('finish', cleanUp);
  res.on('close', cleanUp);

  next();
};

process.on('exit', async () => {
  console.log('Clearing all pending requests before exiting...');
  await pendingRequests.clear();
});

module.exports = concurrentLimiter;
