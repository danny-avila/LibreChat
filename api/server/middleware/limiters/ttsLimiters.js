const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const TTS_IP_MAX = parseInt(process.env.TTS_IP_MAX) || 100;
  const TTS_IP_WINDOW = parseInt(process.env.TTS_IP_WINDOW) || 1;
  const TTS_USER_MAX = parseInt(process.env.TTS_USER_MAX) || 50;
  const TTS_USER_WINDOW = parseInt(process.env.TTS_USER_WINDOW) || 1;
  const TTS_VIOLATION_SCORE = process.env.TTS_VIOLATION_SCORE;

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
    ttsViolationScore: TTS_VIOLATION_SCORE,
  };
};

const createTTSHandler = (ip = true) => {
  const { ttsIpMax, ttsIpWindowInMinutes, ttsUserMax, ttsUserWindowInMinutes, ttsViolationScore } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.TTS_LIMIT;
    const errorMessage = {
      type,
      max: ip ? ttsIpMax : ttsUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? ttsIpWindowInMinutes : ttsUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, ttsViolationScore);
    res.status(429).json({ message: 'Too many TTS requests. Try again later' });
  };
};

const createTTSLimiters = () => {
  const { ttsIpWindowMs, ttsIpMax, ttsUserWindowMs, ttsUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: ttsIpWindowMs,
    max: ttsIpMax,
    handler: createTTSHandler(),
    store: limiterCache('tts_ip_limiter'),
  };

  const userLimiterOptions = {
    windowMs: ttsUserWindowMs,
    max: ttsUserMax,
    handler: createTTSHandler(false),
    store: limiterCache('tts_user_limiter'),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
  };

  const ttsIpLimiter = rateLimit(ipLimiterOptions);
  const ttsUserLimiter = rateLimit(userLimiterOptions);

  return { ttsIpLimiter, ttsUserLimiter };
};

module.exports = createTTSLimiters;
