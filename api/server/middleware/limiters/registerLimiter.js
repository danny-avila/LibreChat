const Keyv = require('keyv');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { removePorts, isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');
const { logViolation } = require('~/cache');
const { logger } = require('~/config');

const { REGISTER_WINDOW = 60, REGISTER_MAX = 5, REGISTRATION_VIOLATION_SCORE: score } = process.env;
const windowMs = REGISTER_WINDOW * 60 * 1000;
const max = REGISTER_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many accounts created, please try again after ${windowInMinutes} minutes`;

const handler = async (req, res) => {
  const type = 'registrations';
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
  logger.debug('Using Redis for register rate limiter.');
  const keyv = new Keyv({ store: keyvRedis });
  const client = keyv.opts.store.redis;
  const sendCommand = (...args) => client.call(...args);
  const store = new RedisStore({
    sendCommand,
    prefix: 'register_limiter:',
  });
  limiterOptions.store = store;
}

const registerLimiter = rateLimit(limiterOptions);

module.exports = registerLimiter;
