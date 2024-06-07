const { errorsToString } = require('librechat-data-provider');
const { Strategy: PassportLocalStrategy } = require('passport-local');
const { findUser, comparePassword, updateUser } = require('~/models');
const { isEnabled, checkEmailConfig } = require('~/server/utils');
const { loginSchema } = require('./validators');
const logger = require('~/utils/logger');

// Unix timestamp for 2024-06-07 15:20:18 Eastern Time
const verificationEnabledTimestamp = 1717788018;

async function validateLoginRequest(req) {
  const { error } = loginSchema.safeParse(req.body);
  return error ? errorsToString(error.errors) : null;
}

async function passportLogin(req, email, password, done) {
  try {
    const validationError = await validateLoginRequest(req);
    if (validationError) {
      logError('Passport Local Strategy - Validation Error', { reqBody: req.body });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: validationError });
    }

    const user = await findUser({ email: email.trim() });
    if (!user) {
      logError('Passport Local Strategy - User Not Found', { email });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: 'Email does not exist.' });
    }

    const isMatch = await comparePassword(user, password);
    if (!isMatch) {
      logError('Passport Local Strategy - Password does not match', { isMatch });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, false, { message: 'Incorrect password.' });
    }

    const emailEnabled = checkEmailConfig();
    const userCreatedAtTimestamp = Math.floor(new Date(user.createdAt).getTime() / 1000);

    if (
      !emailEnabled &&
      !user.emailVerified &&
      userCreatedAtTimestamp < verificationEnabledTimestamp
    ) {
      await updateUser(user._id, { emailVerified: true });
      user.emailVerified = true;
    }

    if (!user.emailVerified && !isEnabled(process.env.ALLOW_UNVERIFIED_EMAIL_LOGIN)) {
      logError('Passport Local Strategy - Email not verified', { email });
      logger.error(`[Login] [Login failed] [Username: ${email}] [Request-IP: ${req.ip}]`);
      return done(null, user, { message: 'Email not verified.' });
    }

    logger.info(`[Login] [Login successful] [Username: ${email}] [Request-IP: ${req.ip}]`);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}

function logError(title, parameters) {
  const entries = Object.entries(parameters).map(([name, value]) => ({ name, value }));
  logger.error(title, { parameters: entries });
}

module.exports = () =>
  new PassportLocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      session: false,
      passReqToCallback: true,
    },
    passportLogin,
  );
