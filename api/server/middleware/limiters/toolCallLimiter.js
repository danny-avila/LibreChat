const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { ViolationTypes } = require('librechat-data-provider');
const ioredisClient = require('~/cache/ioredisClient');
const logViolation = require('~/cache/logViolation');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const handler = async (req, res) => {
  const type = ViolationTypes.TOOL_CALL_LIMIT;
  const errorMessage = {
    type,
    max: 1,
    limiter: 'user',
    windowInMinutes: 1,
  };

  await logViolation(req, res, type, errorMessage, 0);
  res.status(429).json({ message: 'Too many tool call requests. Try again later' });
};

const limiterOptions = {
  windowMs: 1000,
  max: 1,
  handler,
  keyGenerator: function (req) {
    return req.user?.id;
  },
};

if (isEnabled(process.env.USE_REDIS) && ioredisClient) {
  logger.debug('Using Redis for tool call rate limiter.');
  const store = new RedisStore({
    sendCommand: (...args) => ioredisClient.call(...args),
    prefix: 'tool_call_limiter:',
  });
  limiterOptions.store = store;
}

const toolCallLimiter = rateLimit(limiterOptions);

module.exports = toolCallLimiter;
