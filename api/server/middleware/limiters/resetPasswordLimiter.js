const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { removePorts } = require('~/server/utils');
const { logViolation } = require('~/cache');

const {
  RESET_PASSWORD_WINDOW = 2,
  RESET_PASSWORD_MAX = 2,
  RESET_PASSWORD_VIOLATION_SCORE: score,
} = process.env;
const windowMs = RESET_PASSWORD_WINDOW * 60 * 1000;
const max = RESET_PASSWORD_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;

const handler = async (req, res) => {
  const type = ViolationTypes.RESET_PASSWORD_LIMIT;
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
  store: limiterCache('reset_password_limiter'),
};

const resetPasswordLimiter = rateLimit(limiterOptions);

module.exports = resetPasswordLimiter;
