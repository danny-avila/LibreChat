const { isEnabled } = require('~/server/utils');

function validateRegistration(req, res, next) {
  if (req.invite) {
    return next();
  }

  if (isEnabled(process.env.ALLOW_REGISTRATION)) {
    next();
  } else {
    return res.status(403).json({
      message: 'Registration is not allowed.',
    });
  }
}

module.exports = validateRegistration;
