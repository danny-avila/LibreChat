const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Keyv = require('keyv');
const denyRequest = require('~/server/middleware/denyRequest');
const { isEnabled } = require('~/server/utils');
const { logViolation } = require('~/cache');
const keyvRedis = require('~/cache/keyvRedis');
const { logger } = require('~/config');

const {
  MESSAGE_IP_MAX = 40,
  MESSAGE_IP_WINDOW = 1,
  MESSAGE_USER_MAX = 40,
  MESSAGE_USER_WINDOW = 1,
} = process.env;

const ipWindowMs = MESSAGE_IP_WINDOW * 60 * 1000;
const ipMax = MESSAGE_IP_MAX;
const ipWindowInMinutes = ipWindowMs / 60000;

const userWindowMs = MESSAGE_USER_WINDOW * 60 * 1000;
const userMax = MESSAGE_USER_MAX;
const userWindowInMinutes = userWindowMs / 60000;

/**
 * Creates either an IP/User message request rate limiter for excessive requests
 * that properly logs and denies the violation.
 *
 * @param {boolean} [ip=true] - Whether to create an IP limiter or a user limiter.
 * @returns {function} A rate limiter function.
 *
 */
const createHandler = (ip = true) => {
  return async (req, res) => {
    const type = 'message_limit';
    const errorMessage = {
      type,
      max: ip ? ipMax : userMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? ipWindowInMinutes : userWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    return await denyRequest(req, res, errorMessage);
  };
};

/**
 * Message request rate limiters
 */
const ipLimiterOptions = {
  windowMs: ipWindowMs,
  max: ipMax,
  handler: createHandler(),
};

const userLimiterOptions = {
  windowMs: userWindowMs,
  max: userMax,
  handler: createHandler(false),
  keyGenerator: function (req) {
    return req.user?.id; // Use the user ID or NULL if not available
  },
};

if (isEnabled(process.env.USE_REDIS)) {
  logger.info('Using Redis for message rate limiters.');
  const keyv = new Keyv({ store: keyvRedis });
  const client = keyv.opts.store.redis;
  const sendCommand = (...args) => client.call(...args);
  const ipStore = new RedisStore({
    sendCommand,
    prefix: 'message_ip_limiter:',
  });
  const userStore = new RedisStore({
    sendCommand,
    prefix: 'message_user_limiter:',
  });
  ipLimiterOptions.store = ipStore;
  userLimiterOptions.store = userStore;
}

/**
 * Message request rate limiter by IP
 */
const messageIpLimiter = rateLimit(ipLimiterOptions);

/**
 * Message request rate limiter by userId
 */
const messageUserLimiter = rateLimit(userLimiterOptions);

module.exports = {
  messageIpLimiter,
  messageUserLimiter,
};
