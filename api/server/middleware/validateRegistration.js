const { isEnabled } = require('@librechat/api');

function validateRegistration(req, res, next) {
  /* A platform invite, or (in organizations mode) an organization invite, admits a
   * registration even where open registration is off. */
  if (req.invite || req.organizationInvite) {
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
