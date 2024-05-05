const { isEnabled } = require('~/server/utils');

function validatePasswordReset(req, res, next) {
  if (isEnabled(process.env.ALLOW_PASSWORD_RESET)) {
    next();
  } else {
    res.status(403).send('Password reset is not allowed.');
  }
}

module.exports = validatePasswordReset;
