const rateLimit = require('express-rate-limit');
const denyRequest = require('./denyRequest');

const { MESSAGE_IP_MAX, MESSAGE_IP_WINDOW, MESSAGE_USER_MAX, MESSAGE_USER_WINDOW } =
  process.env ?? {};

const ipWindowMs = (MESSAGE_IP_WINDOW ?? 1) * 60 * 1000; // default: 1 minute
const ipMax = MESSAGE_IP_MAX ?? 40; // default: limit each IP to 40 requests per ipWindowMs
const ipWindowInMinutes = ipWindowMs / 60000;

const userWindowMs = (MESSAGE_USER_WINDOW ?? 1) * 60 * 1000; // default: 1 minute
const userMax = MESSAGE_USER_MAX ?? 40; // default: limit each user to 40 requests per userWindowMs
const userWindowInMinutes = userWindowMs / 60000;

/**
 * Creates either an IP/User message request rate limiter for excessive requests.
 */
const createHandler = (ip = true) => {
  return (req, res) => {
    const errorMessage = JSON.stringify({
      type: 'message_limit',
      max: ip ? ipMax : userMax,
      windowInMinutes: ip ? ipWindowInMinutes : userWindowInMinutes,
    });
    return denyRequest(req, res, errorMessage);
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
