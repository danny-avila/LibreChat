const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  TWO_FACTOR_TEMP_WINDOW = 5,
  TWO_FACTOR_TEMP_MAX = 7,
  TWO_FACTOR_TEMP_VIOLATION_SCORE,
  LOGIN_VIOLATION_SCORE,
} = process.env;
const windowMs = TWO_FACTOR_TEMP_WINDOW * 60 * 1000;
const max = TWO_FACTOR_TEMP_MAX;
const score = TWO_FACTOR_TEMP_VIOLATION_SCORE ?? LOGIN_VIOLATION_SCORE;
const windowInMinutes = windowMs / 60000;
const message = `Too many verification attempts, please try again after ${windowInMinutes} minutes.`;

const handler = async (req, res) => {
  const type = ViolationTypes.LOGINS;
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
  store: limiterCache('two_factor_temp_limiter'),
};

const twoFactorTempLimiter = rateLimit(limiterOptions);

module.exports = twoFactorTempLimiter;
