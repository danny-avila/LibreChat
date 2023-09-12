const rateLimit = require('express-rate-limit');
const { logViolation } = require('../../cache');
const { removePorts } = require('../utils');

const type = 'registrations';

const windowMs = (process.env?.REGISTER_WINDOW ?? 60) * 60 * 1000; // default: 1 hour
const max = process.env?.REGISTER_MAX ?? 5; // default: limit each IP to 5 registrations per windowMs
const windowInMinutes = windowMs / 60000;

const handler = async (req, res) => {
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage);
};

const registerLimiter = rateLimit({
  windowMs,
  max,
  message: `Too many accounts created from this IP, please try again after ${windowInMinutes} minutes`,
  handler,
  keyGenerator: removePorts,
});

module.exports = registerLimiter;
