const Keyv = require('keyv');
const { logViolation } = require('../../cache');

const denyRequest = require('./denyRequest');

const { CONCURRENT_MESSAGE_MAX } = process.env ?? {};
const limit = Math.max(CONCURRENT_MESSAGE_MAX ?? 1, 1);
const type = 'concurrent';

// Serve cache from memory so no need to clear it on startup/exit
const pendingReqCache = new Keyv({ namespace: 'pendingRequests' });

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
  if (!pendingReqCache) {
    return next();
  }

  if (Object.keys(req?.body ?? {}).length === 1 && req?.body?.abortKey) {
    return next();
  }

  const userId = req.user.id;
  const pendingRequests = (await pendingReqCache.get(userId)) ?? 0;

  if (pendingRequests >= limit) {
    const errorMessage = {
      type,
      limit,
      pendingRequests,
    };

    await logViolation(type, userId, errorMessage);
    return await denyRequest(req, res, errorMessage);
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

// if cache is not served from memory, clear it on exit
// process.on('exit', async () => {
//   console.log('Clearing all pending requests before exiting...');
//   await pendingReqCache.clear();
// });

module.exports = concurrentLimiter;
