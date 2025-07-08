const rateLimit = require('express-rate-limit');
const { isEnabled } = require('@librechat/api');
const { RedisStore } = require('rate-limit-redis');
const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const ioredisClient = require('~/cache/ioredisClient');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const FORK_IP_MAX = parseInt(process.env.FORK_IP_MAX) || 30;
  const FORK_IP_WINDOW = parseInt(process.env.FORK_IP_WINDOW) || 1;
  const FORK_USER_MAX = parseInt(process.env.FORK_USER_MAX) || 7;
  const FORK_USER_WINDOW = parseInt(process.env.FORK_USER_WINDOW) || 1;

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
  };
};

const createForkHandler = (ip = true) => {
  const { forkIpMax, forkIpWindowInMinutes, forkUserMax, forkUserWindowInMinutes } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.FILE_UPLOAD_LIMIT;
    const errorMessage = {
      type,
      max: ip ? forkIpMax : forkUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? forkIpWindowInMinutes : forkUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    res.status(429).json({ message: 'Too many conversation fork requests. Try again later' });
  };
};

const createForkLimiters = () => {
  const { forkIpWindowMs, forkIpMax, forkUserWindowMs, forkUserMax } = getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: forkIpWindowMs,
    max: forkIpMax,
    handler: createForkHandler(),
  };
  const userLimiterOptions = {
    windowMs: forkUserWindowMs,
    max: forkUserMax,
    handler: createForkHandler(false),
    keyGenerator: function (req) {
      return req.user?.id;
    },
  };

  if (isEnabled(process.env.USE_REDIS) && ioredisClient) {
    logger.debug('Using Redis for fork rate limiters.');
    const sendCommand = (...args) => ioredisClient.call(...args);
    const ipStore = new RedisStore({
      sendCommand,
      prefix: 'fork_ip_limiter:',
    });
    const userStore = new RedisStore({
      sendCommand,
      prefix: 'fork_user_limiter:',
    });
    ipLimiterOptions.store = ipStore;
    userLimiterOptions.store = userStore;
  }

  const forkIpLimiter = rateLimit(ipLimiterOptions);
  const forkUserLimiter = rateLimit(userLimiterOptions);
  return { forkIpLimiter, forkUserLimiter };
};

module.exports = { createForkLimiters };
