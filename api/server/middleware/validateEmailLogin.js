const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

function validateEmailLogin(req, res, next) {
  const emailLoginEnabled =
    process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);
  if (emailLoginEnabled) {
    return next();
  }

  if (isEnabled(process.env.ALLOW_EMAIL_LOGIN_OVERRIDE)) {
    logger.warn(
      `[validateEmailLogin] Email login is disabled; allowing login attempt via ALLOW_EMAIL_LOGIN_OVERRIDE. IP: ${req.ip}`,
    );
    return next();
  }

  logger.warn(`[validateEmailLogin] Login attempt while email login is disabled. IP: ${req.ip}`);
  return res.status(403).json({ message: 'Email login is not allowed.' });
}

module.exports = validateEmailLogin;
