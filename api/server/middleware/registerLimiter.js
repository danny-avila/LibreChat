const rateLimit = require('express-rate-limit');
const { logViolation } = require('../../cache');
const { removePorts } = require('../utils');

const { REGISTER_WINDOW = 60, REGISTER_MAX = 5, REGISTRATION_VIOLATION_SCORE: score } = process.env;
const windowMs = REGISTER_WINDOW * 60 * 1000;
const max = REGISTER_MAX;
const windowInMinutes = windowMs / 60000;

const handler = async (req, res) => {
  const type = 'registrations';
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
};

const registerLimiter = rateLimit({
  windowMs,
  max,
  message: `Too many accounts created from this IP, please try again after ${windowInMinutes} minutes`,
  handler,
  keyGenerator: removePorts,
});

module.exports = registerLimiter;
