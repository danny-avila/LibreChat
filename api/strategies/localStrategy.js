const { Strategy: PassportLocalStrategy } = require('passport-local');
const User = require('../models/User');
const { loginSchema } = require('./validators');
const DebugControl = require('../utils/debug.js');

async function validateLoginRequest(req) {
  const { error } = loginSchema.validate(req.body);
  return error ? error.details[0].message : null;
}

async function findUserByEmail(email) {
  return User.findOne({ email: email.trim() });
}

async function comparePassword(user, password) {
  return new Promise((resolve, reject) => {
    user.comparePassword(password, function (err, isMatch) {
      if (err) {
        return reject(err);
      }
      resolve(isMatch);
    });
  });
}

async function passportLogin(req, email, password, done) {
  try {
    const validationError = await validateLoginRequest(req);
    if (validationError) {
      logError('Passport Local Strategy - Validation Error', { reqBody: req.body });
      return done(null, false, { message: validationError });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      logError('Passport Local Strategy - User Not Found', { email });
      return done(null, false, { message: 'Email does not exist.' });
    }

    const isMatch = await comparePassword(user, password);
    if (!isMatch) {
      logError('Passport Local Strategy - Password does not match', { isMatch });
      return done(null, false, { message: 'Incorrect password.' });
    }

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}

function logError(title, parameters) {
  DebugControl.log.functionName(title);
  if (parameters) {
    DebugControl.log.parameters(parameters);
  }
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
