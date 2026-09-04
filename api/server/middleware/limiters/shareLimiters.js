const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const SHARE_IP_MAX = parseInt(process.env.SHARE_IP_MAX) || 100;
  const SHARE_IP_WINDOW = parseInt(process.env.SHARE_IP_WINDOW) || 1;
  const SHARE_USER_MAX = parseInt(process.env.SHARE_USER_MAX) || 60;
  const SHARE_USER_WINDOW = parseInt(process.env.SHARE_USER_WINDOW) || 1;
  const SHARE_VIOLATION_SCORE = process.env.SHARE_VIOLATION_SCORE;

  const shareIpWindowMs = SHARE_IP_WINDOW * 60 * 1000;
  const shareIpMax = SHARE_IP_MAX;
  const shareIpWindowInMinutes = shareIpWindowMs / 60000;

  const shareUserWindowMs = SHARE_USER_WINDOW * 60 * 1000;
  const shareUserMax = SHARE_USER_MAX;
  const shareUserWindowInMinutes = shareUserWindowMs / 60000;

  return {
    shareIpWindowMs,
    shareIpMax,
    shareIpWindowInMinutes,
    shareUserWindowMs,
    shareUserMax,
    shareUserWindowInMinutes,
    shareViolationScore: SHARE_VIOLATION_SCORE,
  };
};

const createShareHandler = (ip = true) => {
  const {
    shareIpMax,
    shareUserMax,
    shareViolationScore,
    shareIpWindowInMinutes,
    shareUserWindowInMinutes,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.SHARE_LIMIT;
    const errorMessage = {
      type,
      max: ip ? shareIpMax : shareUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? shareIpWindowInMinutes : shareUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, shareViolationScore);
    res.status(429).json({ message: 'Too many shared link requests. Try again later' });
  };
};

/**
 * Bounds shared-link retrieval, which re-inspects the whole shared snapshot
 * on every request and is reachable without authentication.
 */
const createShareLimiters = () => {
  const { shareIpWindowMs, shareIpMax, shareUserWindowMs, shareUserMax } =
    getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: shareIpWindowMs,
    max: shareIpMax,
    handler: createShareHandler(),
    keyGenerator: removePorts,
    store: limiterCache('share_ip_limiter'),
  };
  const userLimiterOptions = {
    windowMs: shareUserWindowMs,
    max: shareUserMax,
    handler: createShareHandler(false),
    skip: function (req) {
      return req.user?.id == null;
    },
    keyGenerator: function (req) {
      return req.user.id;
    },
    store: limiterCache('share_user_limiter'),
  };

  const shareIpLimiter = rateLimit(ipLimiterOptions);
  const shareUserLimiter = rateLimit(userLimiterOptions);
  return { shareIpLimiter, shareUserLimiter };
};

module.exports = { createShareLimiters };
