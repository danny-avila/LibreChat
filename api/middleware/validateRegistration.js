function validateRegistration(req, res, next) {
  const setting = process.env.ALLOW_REGISTRATION?.toLowerCase();
  console.log('validateRegistration setting', setting);
  if (setting === 'true') {
    next();
  } else {
    res.status(403).send('Registration is not allowed.');
  }
}

module.exports = validateRegistration;
