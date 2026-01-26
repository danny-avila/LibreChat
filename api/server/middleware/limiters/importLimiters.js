const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const getEnvironmentVariables = () => {
  const IMPORT_IP_MAX = parseInt(process.env.IMPORT_IP_MAX) || 100;
  const IMPORT_IP_WINDOW = parseInt(process.env.IMPORT_IP_WINDOW) || 15;
  const IMPORT_USER_MAX = parseInt(process.env.IMPORT_USER_MAX) || 50;
  const IMPORT_USER_WINDOW = parseInt(process.env.IMPORT_USER_WINDOW) || 15;
  const IMPORT_VIOLATION_SCORE = process.env.IMPORT_VIOLATION_SCORE;

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
    importViolationScore: IMPORT_VIOLATION_SCORE,
  };
};

const createImportHandler = (ip = true) => {
  const {
    importIpMax,
    importUserMax,
    importViolationScore,
    importIpWindowInMinutes,
    importUserWindowInMinutes,
  } = getEnvironmentVariables();

  return async (req, res) => {
    const type = ViolationTypes.FILE_UPLOAD_LIMIT;
    const errorMessage = {
      type,
      max: ip ? importIpMax : importUserMax,
      limiter: ip ? 'ip' : 'user',
      windowInMinutes: ip ? importIpWindowInMinutes : importUserWindowInMinutes,
    };

    await logViolation(req, res, type, errorMessage, importViolationScore);
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
    store: limiterCache('import_ip_limiter'),
  };
  const userLimiterOptions = {
    windowMs: importUserWindowMs,
    max: importUserMax,
    handler: createImportHandler(false),
    keyGenerator: function (req) {
      return req.user?.id; // Use the user ID or NULL if not available
    },
    store: limiterCache('import_user_limiter'),
  };

  const importIpLimiter = rateLimit(ipLimiterOptions);
  const importUserLimiter = rateLimit(userLimiterOptions);
  return { importIpLimiter, importUserLimiter };
};

module.exports = { createImportLimiters };
