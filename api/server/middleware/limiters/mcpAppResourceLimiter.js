const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const { TOOL_CALL_VIOLATION_SCORE: score } = process.env;

const handler = async (req, res) => {
  const type = ViolationTypes.TOOL_CALL_LIMIT;
  const errorMessage = {
    type,
    max: 120,
    limiter: 'user',
    windowInMinutes: 1,
  };

  await logViolation(req, res, type, errorMessage, score);
  res.status(429).json({ message: 'Too many app resource requests. Try again later' });
};

const limiterOptions = {
  windowMs: 60 * 1000,
  max: 120,
  handler,
  keyGenerator: function (req) {
    return req.user?.id;
  },
  store: limiterCache('mcp_app_resource_limiter'),
};

const mcpAppResourceLimiter = rateLimit(limiterOptions);

module.exports = mcpAppResourceLimiter;
