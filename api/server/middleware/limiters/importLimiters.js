const Keyv = require('keyv');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');
const { isEnabled } = require('~/server/utils');
const keyvRedis = require('~/cache/keyvRedis');
const { logger } = require('~/config');

const getEnvironmentVariables = () => {
  const IMPORT_IP_MAX = parseInt(process.env.IMPORT_IP_MAX) || 100;
  const IMPORT_IP_WINDOW = parseInt(process.env.IMPORT_IP_WINDOW) || 15;
  const IMPORT_USER_MAX = parseInt(process.env.IMPORT_USER_MAX) || 50;
  const IMPORT_USER_WINDOW = parseInt(process.env.IMPORT_USER_WINDOW) || 15;

  const importIpWindowMs = IMPORT_IP_WINDOW * 60 * 1000;
  const importIpMax = IMPORT_IP_MAX;
  const importIpWindowInMinutes = importIpWindowMs / 60000;

  const importUserWindowMs = IMPORT_USER_WINDOW * 60 * 1000;
  const importUserMax = IMPORT_USER_MAX;
  const importUserWindowInMinutes = importUserWindowMs / 60000;

  return {
    importIpWindowMs,
    importIpMax,
    importIpWindowInMinutes,
    importUserWindowMs,
    importUserMax,
    importUserWindowInMinutes,
  };
};

const createImportHandler = (ip = true) => {
  const { importIpMax, importIpWindowInMinutes, importUserMax, importUserWindowInMinutes } =
    getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.FILE_UPLOAD_LIMIT;
    const errorMessage = {
      type,
      max: ip ? importIpMax : importUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? importIpWindowInMinutes : importUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage);
    res.status(429).json({ message: 'Too many conversation import requests. Try again later' });
  };
};

const createImportLimiters = () => {
  const { importIpWindowMs, importIpMax, importUserWindowMs, importUserMax } =
    getEnvironmentVariables();

  const ipLimiterOptions = {
    windowMs: importIpWindowMs,
    max: importIpMax,
    handler: createImportHandler(),
  };
  const userLimiterOptions = {
    windowMs: importUserWindowMs,
    max: importUserMax,
    handler: createImportHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
  };

  if (isEnabled(process.env.USE_REDIS)) {
    logger.debug('Using Redis for import rate limiters.');
    const keyv = new Keyv({ store: keyvRedis });
    const client = keyv.opts.store.redis;
    const sendCommand = (...args) => client.call(...args);
    const ipStore = new RedisStore({
      sendCommand,
      prefix: 'import_ip_limiter:',
    });
    const userStore = new RedisStore({
      sendCommand,
      prefix: 'import_user_limiter:',
    });
    ipLimiterOptions.store = ipStore;
    userLimiterOptions.store = userStore;
  }

  const importIpLimiter = rateLimit(ipLimiterOptions);
  const importUserLimiter = rateLimit(userLimiterOptions);
  return { importIpLimiter, importUserLimiter };
};

module.exports = { createImportLimiters };
