const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const toolCallLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  handler: async (req, res) => {
    const type = ViolationTypes.TOOL_CALL_LIMIT;
    const errorMessage = {
      type,
      max: 1,
      limiter: 'user',
      windowInMinutes: 1,
    };

    await logViolation(req, res, type, errorMessage, 0);
    res.status(429).json({ message: 'Too many tool call requests. Try again later' });
  },
  keyGenerator: function (req) {
    return req.user?.id;
  },
});

module.exports = toolCallLimiter;
