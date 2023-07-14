const passport = require('passport');
const PassportLocalStrategy = require('passport-local').Strategy;

const User = require('../models/User');
const { loginSchema } = require('./validators');
const DebugControl = require('../utils/debug.js');

const passportLogin = new PassportLocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
    session: false,
    passReqToCallback: true,
  },
  async (req, email, password, done) => {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      log({
        title: 'Passport Local Strategy - Validation Error',
        parameters: [{ name: 'req.body', value: req.body }],
      });
      return done(null, false, { message: error.details[0].message });
    }

    try {
      const user = await User.findOne({ email: email.trim() });
      if (!user) {
        log({
          title: 'Passport Local Strategy - User Not Found',
          parameters: [{ name: 'email', value: email }],
        });
        return done(null, false, { message: 'Email does not exists.' });
      }

      user.comparePassword(password, function (err, isMatch) {
        if (err) {
          log({
            title: 'Passport Local Strategy - Compare password error',
            parameters: [{ name: 'error', value: err }],
          });
          return done(err);
        }
        if (!isMatch) {
          log({
            title: 'Passport Local Strategy - Password does not match',
            parameters: [{ name: 'isMatch', value: isMatch }],
          });
          return done(null, false, { message: 'Incorrect password.' });
        }

        return done(null, user);
      });
    } catch (err) {
      return done(err);
    }
  },
);

passport.use(passportLogin);

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  if (parameters) {
    DebugControl.log.parameters(parameters);
  }
}
