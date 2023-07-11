const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

// Google strategy
const googleLogin = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${domains.server}${process.env.GOOGLE_CALLBACK_URL}`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
      const googleId = profile.id;
      const email = profile.emails[0].value;

      const existingUser = await User.findOne({ googleId });
      if (existingUser) {
        return cb(null, existingUser);
      }

      const userWithEmail = await User.findOne({ email });
      if (userWithEmail) {
        userWithEmail.googleId = googleId;
        await userWithEmail.save();
        return cb(null, userWithEmail);
      }

      const newUser = await new User({
        provider: 'google',
        googleId,
        username: profile.name.givenName,
        email,
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
