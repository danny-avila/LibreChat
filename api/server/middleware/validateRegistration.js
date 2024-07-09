const { isEnabled } = require('~/server/utils');

function validateRegistration(req, res, next) {
  if (isEnabled(process.env.ALLOW_REGISTRATION)) {
    next();
  } else {
    res.status(403).send('Registration is not allowed.');
  }
}

module.exports = validateRegistration;
