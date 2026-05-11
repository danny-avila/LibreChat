const { isEnabled } = require('@librechat/api');
const { countUsers } = require('~/models');

async function validateRegistration(req, res, next) {
  if (req.invite) {
    return next();
  }

  if (isEnabled(process.env.ALLOW_REGISTRATION)) {
    return next();
  }

  try {
    const userCount = await countUsers();
    if (userCount === 0) {
      return next();
    }
  } catch (error) {
    // Fallback if DB check fails
  }

  return res.status(403).json({
    message: 'Registration is not allowed.',
  });
}

module.exports = validateRegistration;
