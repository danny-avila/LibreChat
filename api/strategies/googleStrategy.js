const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth2');

const User = require('../models/User');

const serverUrl =
  process.env.NODE_ENV === 'production' ? process.env.SERVER_URL_PROD : process.env.SERVER_URL_DEV;

// google strategy
const googleLogin = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${serverUrl}${process.env.GOOGLE_CALLBACK_URL}`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    // console.log(profile);
    try {
      const oldUser = await User.findOne({ email: profile.email });

      if (oldUser) {
        return done(null, oldUser);
      }
    } catch (err) {
      console.log(err);
    }

    try {
      const newUser = await new User({
        auth_provider: 'google',
        googleId: profile.id,
        username: `user${profile.id}`,
        email: profile.email,
        name: profile.displayName,
        avatar: profile.picture
      }).save();
      done(null, newUser);
    } catch (err) {
      console.log(err);
    }
  }
);

passport.use(googleLogin);
