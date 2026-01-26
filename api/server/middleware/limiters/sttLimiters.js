const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const STT_IP_MAX = parseInt(process.env.STT_IP_MAX) || 100;
  const STT_IP_WINDOW = parseInt(process.env.STT_IP_WINDOW) || 1;
  const STT_USER_MAX = parseInt(process.env.STT_USER_MAX) || 50;
  const STT_USER_WINDOW = parseInt(process.env.STT_USER_WINDOW) || 1;
  const STT_VIOLATION_SCORE = process.env.STT_VIOLATION_SCORE;

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
    sttViolationScore: STT_VIOLATION_SCORE,
  };
};

const createSTTHandler = (ip = true) => {
  const { sttIpMax, sttIpWindowInMinutes, sttUserMax, sttUserWindowInMinutes, sttViolationScore } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.STT_LIMIT;
    const errorMessage = {
      type,
      max: ip ? sttIpMax : sttUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? sttIpWindowInMinutes : sttUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, sttViolationScore);
    res.status(429).json({ message: 'Too many STT requests. Try again later' });
  };
};

const createSTTLimiters = () => {
  const { sttIpWindowMs, sttIpMax, sttUserWindowMs, sttUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: sttIpWindowMs,
    max: sttIpMax,
    handler: createSTTHandler(),
    store: limiterCache('stt_ip_limiter'),
  };

  const userLimiterOptions = {
    windowMs: sttUserWindowMs,
    max: sttUserMax,
    handler: createSTTHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
    store: limiterCache('stt_user_limiter'),
  };

  const sttIpLimiter = rateLimit(ipLimiterOptions);
  const sttUserLimiter = rateLimit(userLimiterOptions);

  return { sttIpLimiter, sttUserLimiter };
};

module.exports = createSTTLimiters;
