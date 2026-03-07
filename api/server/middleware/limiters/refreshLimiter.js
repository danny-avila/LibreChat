const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@bizu/api');
const { removePorts } = require('~/server/utils');

// Allow 30 refresh attempts per 15-minute window per IP.
// Legitimate clients refresh once per session expiry (~15 min).
const { REFRESH_WINDOW = 15, REFRESH_MAX = 30 } = process.env;
const windowMs = REFRESH_WINDOW * 60 * 1000;
const max = Number(REFRESH_MAX);
const windowInMinutes = windowMs / 60000;
const message = `Too many refresh attempts, please try again after ${windowInMinutes} minutes.`;

const handler = async (_req, res) => {
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('refresh_limiter'),
};

const refreshLimiter = rateLimit(limiterOptions);

module.exports = refreshLimiter;
