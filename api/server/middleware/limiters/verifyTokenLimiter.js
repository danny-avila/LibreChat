const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@bizu/api');
const { removePorts } = require('~/server/utils');

// Allow 5 verification token submission attempts per 5-minute window per IP.
// Prevents brute-forcing of email verification tokens.
const { VERIFY_TOKEN_WINDOW = 5, VERIFY_TOKEN_MAX = 5 } = process.env;
const windowMs = VERIFY_TOKEN_WINDOW * 60 * 1000;
const max = Number(VERIFY_TOKEN_MAX);
const windowInMinutes = windowMs / 60000;
const message = `Too many verification attempts, please try again after ${windowInMinutes} minutes.`;

const handler = async (_req, res) => {
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('verify_token_limiter'),
};

const verifyTokenLimiter = rateLimit(limiterOptions);

module.exports = verifyTokenLimiter;
