const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { ViolationTypes } = require('librechat-data-provider');
const ioredisClient = require('~/cache/ioredisClient');
const logViolation = require('~/cache/logViolation');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const getEnvironmentVariables = () => {
  const TTS_IP_MAX = parseInt(process.env.TTS_IP_MAX) || 100;
  const TTS_IP_WINDOW = parseInt(process.env.TTS_IP_WINDOW) || 1;
  const TTS_USER_MAX = parseInt(process.env.TTS_USER_MAX) || 50;
  const TTS_USER_WINDOW = parseInt(process.env.TTS_USER_WINDOW) || 1;

  const ttsIpWindowMs = TTS_IP_WINDOW * 60 * 1000;
  const ttsIpMax = TTS_IP_MAX;
  const ttsIpWindowInMinutes = ttsIpWindowMs / 60000;

  const ttsUserWindowMs = TTS_USER_WINDOW * 60 * 1000;
  const ttsUserMax = TTS_USER_MAX;
  const ttsUserWindowInMinutes = ttsUserWindowMs / 60000;

  return {
    ttsIpWindowMs,
    ttsIpMax,
    ttsIpWindowInMinutes,
    ttsUserWindowMs,
    ttsUserMax,
    ttsUserWindowInMinutes,
  };
};

const createTTSHandler = (ip = true) => {
  const { ttsIpMax, ttsIpWindowInMinutes, ttsUserMax, ttsUserWindowInMinutes } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.TTS_LIMIT;
    const errorMessage = {
      type,
      max: ip ? ttsIpMax : ttsUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? ttsIpWindowInMinutes : ttsUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    res.status(429).json({ message: 'Too many TTS requests. Try again later' });
  };
};

const createTTSLimiters = () => {
  const { ttsIpWindowMs, ttsIpMax, ttsUserWindowMs, ttsUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: ttsIpWindowMs,
    max: ttsIpMax,
    handler: createTTSHandler(),
  };

  const userLimiterOptions = {
    windowMs: ttsUserWindowMs,
    max: ttsUserMax,
    handler: createTTSHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
  };

  if (isEnabled(process.env.USE_REDIS) && ioredisClient) {
    logger.debug('Using Redis for TTS rate limiters.');
    const sendCommand = (...args) => ioredisClient.call(...args);
    const ipStore = new RedisStore({
      sendCommand,
      prefix: 'tts_ip_limiter:',
    });
    const userStore = new RedisStore({
      sendCommand,
      prefix: 'tts_user_limiter:',
    });
    ipLimiterOptions.store = ipStore;
    userLimiterOptions.store = userStore;
  }

  const ttsIpLimiter = rateLimit(ipLimiterOptions);
  const ttsUserLimiter = rateLimit(userLimiterOptions);

  return { ttsIpLimiter, ttsUserLimiter };
};

module.exports = createTTSLimiters;
