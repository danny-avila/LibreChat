const { isEnabled } = require('~/server/utils');

function validateRegistration(req, res, next) {
  console.log('Invite:', req.invite);
  if (req.invite) {
    console.log('Registration is allowed because of invite.');
    return next();
  }

  if (isEnabled(process.env.ALLOW_REGISTRATION)) {
    console.log('Registration is allowed.');
    next();
  } else {
    console.log('Registration is not allowed.');
    res.status(403).send('Registration is not allowed.');
  }
}

module.exports = validateRegistration;
