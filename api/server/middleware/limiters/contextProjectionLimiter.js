const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');

const { CONTEXT_PROJECTION_WINDOW = 1, CONTEXT_PROJECTION_MAX = 20 } = process.env;

const windowMs = (parseInt(CONTEXT_PROJECTION_WINDOW, 10) || 1) * 60 * 1000;
const max = parseInt(CONTEXT_PROJECTION_MAX, 10) || 20;

const contextProjectionLimiter = rateLimit({
  windowMs,
  max,
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many context projection requests. Try again later' });
  },
  keyGenerator: (req) => req.user?.id,
  store: limiterCache('context_projection_limiter'),
});

module.exports = contextProjectionLimiter;
