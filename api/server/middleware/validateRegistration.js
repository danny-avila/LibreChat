function validateRegistration(req, res, next) {
  const setting = process.env.ALLOW_REGISTRATION?.toLowerCase();
  if (setting === 'true') {
    next();
  } else {
    res.status(403).send('Registration is not allowed.');
  }
}

module.exports = validateRegistration;
