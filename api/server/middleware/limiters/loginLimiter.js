const Keyv = require('keyv');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { removePorts, isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');
const { logViolation } = require('~/cache');
const { logger } = require('~/config');

const { LOGIN_WINDOW = 5, LOGIN_MAX = 7, LOGIN_VIOLATION_SCORE: score } = process.env;
const windowMs = LOGIN_WINDOW * 60 * 1000;
const max = LOGIN_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many login attempts, please try again after ${windowInMinutes} minutes.`;

const handler = async (req, res) => {
  const type = 'logins';
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
  logger.debug('Using Redis for login rate limiter.');
  const keyv = new Keyv({ store: keyvRedis });
  const client = keyv.opts.store.redis;
  const sendCommand = (...args) => client.call(...args);
  const store = new RedisStore({
    sendCommand,
    prefix: 'login_limiter:',
  });
  limiterOptions.store = store;
}

const loginLimiter = rateLimit(limiterOptions);

module.exports = loginLimiter;
