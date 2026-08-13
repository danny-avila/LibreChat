const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const { LOGIN_WINDOW = 5, LOGIN_MAX = 7, LOGIN_VIOLATION_SCORE: score } = process.env;
const windowMs = LOGIN_WINDOW * 60 * 1000;
const max = LOGIN_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many login attempts, please try again after ${windowInMinutes} minutes.`;

const handler = async (req, res) => {
  const type = ViolationTypes.LOGINS;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('login_limiter'),
};

const loginLimiter = rateLimit(limiterOptions);

/**
 * Creates a login-limiter instance sharing the same window/max/store/key-generator
 * configuration as the default login limiter, but with a caller-supplied handler.
 * Used for a Clerk-specific instance whose handler records the normal violation
 * and returns a stable `{code: 'CLERK_LOGIN_RATE_LIMITED'}` body instead of the
 * default plain-message response.
 *
 * @param {(req: Object, res: Object) => Promise<Object>} clerkHandler
 * @returns {import('express').RequestHandler}
 */
const createLoginLimiter = (clerkHandler) =>
  rateLimit({ ...limiterOptions, handler: clerkHandler, store: limiterCache('login_limiter') });

/**
 * The default Clerk login-limiter handler: records the same violation as the
 * local-login limiter, then returns the stable Clerk error code body.
 */
const clerkLoginLimiterHandler = async (req, res) => {
  const type = ViolationTypes.LOGINS;
  const errorMessage = { type, max, windowInMinutes };
  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ code: 'CLERK_LOGIN_RATE_LIMITED' });
};

module.exports = loginLimiter;
module.exports.createLoginLimiter = createLoginLimiter;
module.exports.clerkLoginLimiterHandler = clerkLoginLimiterHandler;
