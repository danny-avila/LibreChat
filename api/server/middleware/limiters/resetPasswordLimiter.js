const Keyv = require('keyv');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { ViolationTypes } = require('librechat-data-provider');
const { removePorts, isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');
const { logViolation } = require('~/cache');
const { logger } = require('~/config');

const {
  RESET_PASSWORD_WINDOW = 2,
  RESET_PASSWORD_MAX = 2,
  RESET_PASSWORD_VIOLATION_SCORE: score,
} = process.env;
const windowMs = RESET_PASSWORD_WINDOW * 60 * 1000;
const max = RESET_PASSWORD_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;

const handler = async (req, res) => {
  const type = ViolationTypes.RESET_PASSWORD_LIMIT;
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
};

if (isEnabled(process.env.USE_REDIS)) {
  logger.info('Using Redis for reset password rate limiter.');
  const keyv = new Keyv({ store: keyvRedis });
  const client = keyv.opts.store.redis;
  const sendCommand = (...args) => client.call(...args);
  const store = new RedisStore({
    sendCommand,
    prefix: 'reset_password_limiter:',
  });
  limiterOptions.store = store;
}

const resetPasswordLimiter = rateLimit(limiterOptions);

module.exports = resetPasswordLimiter;
