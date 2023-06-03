const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

// google strategy
const googleLogin = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${domains.server}${process.env.GOOGLE_CALLBACK_URL}`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
      const oldUser = await User.findOne({ email: profile.emails[0].value });
      if (oldUser) {
        return cb(null, oldUser);
      }
    } catch (err) {
      console.log(err);
    }

    try {
      const newUser = await new User({
        provider: 'google',
        googleId: profile.id,
        username: profile.name.givenName,
        email: profile.emails[0].value,
        emailVerified: profile.emails[0].verified,
        name: `${profile.name.givenName} ${profile.name.familyName}`,
        avatar: profile.photos[0].value
      }).save();
      cb(null, newUser);
    } catch (err) {
      console.log(err);
    }
  }
);

passport.use(googleLogin);
