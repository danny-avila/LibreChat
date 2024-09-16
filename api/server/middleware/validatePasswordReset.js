const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

function validatePasswordReset(req, res, next) {
  if (isEnabled(process.env.ALLOW_PASSWORD_RESET)) {
    next();
  } else {
    logger.warn(`Password reset attempt while not allowed. IP: ${req.ip}`);
    res.status(403).send('Password reset is not allowed.');
  }
}

module.exports = validatePasswordReset;
