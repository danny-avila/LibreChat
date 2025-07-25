const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache } = require('~/cache/cacheFactory');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const FORK_IP_MAX = parseInt(process.env.FORK_IP_MAX) || 30;
  const FORK_IP_WINDOW = parseInt(process.env.FORK_IP_WINDOW) || 1;
  const FORK_USER_MAX = parseInt(process.env.FORK_USER_MAX) || 7;
  const FORK_USER_WINDOW = parseInt(process.env.FORK_USER_WINDOW) || 1;
  const FORK_VIOLATION_SCORE = process.env.FORK_VIOLATION_SCORE;

  const forkIpWindowMs = FORK_IP_WINDOW * 60 * 1000;
  const forkIpMax = FORK_IP_MAX;
  const forkIpWindowInMinutes = forkIpWindowMs / 60000;

  const forkUserWindowMs = FORK_USER_WINDOW * 60 * 1000;
  const forkUserMax = FORK_USER_MAX;
  const forkUserWindowInMinutes = forkUserWindowMs / 60000;

  return {
    forkIpWindowMs,
    forkIpMax,
    forkIpWindowInMinutes,
    forkUserWindowMs,
    forkUserMax,
    forkUserWindowInMinutes,
    forkViolationScore: FORK_VIOLATION_SCORE,
  };
};

const createForkHandler = (ip = true) => {
  const {
    forkIpMax,
    forkUserMax,
    forkViolationScore,
    forkIpWindowInMinutes,
    forkUserWindowInMinutes,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.FILE_UPLOAD_LIMIT;
    const errorMessage = {
      type,
      max: ip ? forkIpMax : forkUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? forkIpWindowInMinutes : forkUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, forkViolationScore);
    res.status(429).json({ message: 'Too many conversation fork requests. Try again later' });
  };
};

const createForkLimiters = () => {
  const { forkIpWindowMs, forkIpMax, forkUserWindowMs, forkUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: forkIpWindowMs,
    max: forkIpMax,
    handler: createForkHandler(),
    store: limiterCache('fork_ip_limiter'),
  };
  const userLimiterOptions = {
    windowMs: forkUserWindowMs,
    max: forkUserMax,
    handler: createForkHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
    store: limiterCache('fork_user_limiter'),
  };

  const forkIpLimiter = rateLimit(ipLimiterOptions);
  const forkUserLimiter = rateLimit(userLimiterOptions);
  return { forkIpLimiter, forkUserLimiter };
};

module.exports = { createForkLimiters };
