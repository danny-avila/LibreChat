const rateLimit = require('express-rate-limit');
const { logViolation } = require('../../cache');
const { removePorts } = require('../utils');

const { LOGIN_WINDOW = 5, LOGIN_MAX = 7, LOGIN_VIOLATION_SCORE: score } = process.env;
const windowMs = LOGIN_WINDOW * 60 * 1000;
const max = LOGIN_MAX;
const windowInMinutes = windowMs / 60000;

const handler = async (req, res) => {
  const type = 'logins';
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
};

const loginLimiter = rateLimit({
  windowMs,
  max,
  message: `Too many login attempts from this IP, please try again after ${windowInMinutes} minutes.`,
  handler,
  keyGenerator: removePorts,
});

module.exports = loginLimiter;
