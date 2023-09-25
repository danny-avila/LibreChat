const rateLimit = require('express-rate-limit');
const { logViolation } = require('../../cache');
const denyRequest = require('./denyRequest');

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
 * Message request rate limiter by IP
 */
const messageIpLimiter = rateLimit({
  windowMs: ipWindowMs,
  max: ipMax,
  handler: createHandler(),
});

/**
 * Message request rate limiter by userId
 */
const messageUserLimiter = rateLimit({
  windowMs: userWindowMs,
  max: userMax,
  handler: createHandler(false),
  keyGenerator: function (req) {
    return req.user?.id; // Use the user ID or NULL if not available
  },
});

module.exports = {
  messageIpLimiter,
  messageUserLimiter,
};
