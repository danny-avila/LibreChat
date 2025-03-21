const Keyv = require('keyv');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');
const { isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');
const { logger } = require('~/config');

const getEnvironmentVariables = () => {
  const STT_IP_MAX = parseInt(process.env.STT_IP_MAX) || 100;
  const STT_IP_WINDOW = parseInt(process.env.STT_IP_WINDOW) || 1;
  const STT_USER_MAX = parseInt(process.env.STT_USER_MAX) || 50;
  const STT_USER_WINDOW = parseInt(process.env.STT_USER_WINDOW) || 1;

  const sttIpWindowMs = STT_IP_WINDOW * 60 * 1000;
  const sttIpMax = STT_IP_MAX;
  const sttIpWindowInMinutes = sttIpWindowMs / 60000;

  const sttUserWindowMs = STT_USER_WINDOW * 60 * 1000;
  const sttUserMax = STT_USER_MAX;
  const sttUserWindowInMinutes = sttUserWindowMs / 60000;

  return {
    sttIpWindowMs,
    sttIpMax,
    sttIpWindowInMinutes,
    sttUserWindowMs,
    sttUserMax,
    sttUserWindowInMinutes,
  };
};

const createSTTHandler = (ip = true) => {
  const { sttIpMax, sttIpWindowInMinutes, sttUserMax, sttUserWindowInMinutes } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.STT_LIMIT;
    const errorMessage = {
      type,
      max: ip ? sttIpMax : sttUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? sttIpWindowInMinutes : sttUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    res.status(429).json({ message: 'Too many STT requests. Try again later' });
  };
};

const createSTTLimiters = () => {
  const { sttIpWindowMs, sttIpMax, sttUserWindowMs, sttUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: sttIpWindowMs,
    max: sttIpMax,
    handler: createSTTHandler(),
  };

  const userLimiterOptions = {
    windowMs: sttUserWindowMs,
    max: sttUserMax,
    handler: createSTTHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
  };

  if (isEnabled(process.env.USE_REDIS)) {
    logger.debug('Using Redis for STT rate limiters.');
    const keyv = new Keyv({ store: keyvRedis });
    const client = keyv.opts.store.redis;
    const sendCommand = (...args) => client.call(...args);
    const ipStore = new RedisStore({
      sendCommand,
      prefix: 'stt_ip_limiter:',
    });
    const userStore = new RedisStore({
      sendCommand,
      prefix: 'stt_user_limiter:',
    });
    ipLimiterOptions.store = ipStore;
    userLimiterOptions.store = userStore;
  }

  const sttIpLimiter = rateLimit(ipLimiterOptions);
  const sttUserLimiter = rateLimit(userLimiterOptions);

  return { sttIpLimiter, sttUserLimiter };
};

module.exports = createSTTLimiters;
