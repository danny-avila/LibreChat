function validatePasswordReset(req, res, next) {
  const setting = process.env.ALLOW_PASSWORD_RESET?.toLowerCase();
  if (setting === 'true' || setting === undefined) {
    next();
  } else {
    res.status(403).send('Password reset is not allowed.');
  }
}

module.exports = validatePasswordReset;
