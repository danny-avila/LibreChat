const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');

const PROMPT_USAGE_WINDOW_MS = 60 * 1000; // 1 minute
const PROMPT_USAGE_MAX = 30; // 30 usage increments per user per minute

const promptUsageLimiter = rateLimit({
  windowMs: PROMPT_USAGE_WINDOW_MS,
  max: PROMPT_USAGE_MAX,
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many prompt usage requests. Try again later' });
  },
  keyGenerator: (req) => req.user?.id,
  store: limiterCache('prompt_usage_limiter'),
});

module.exports = { promptUsageLimiter };
