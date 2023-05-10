const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

const serverUrl =
  process.env.NODE_ENV === 'production' ? process.env.SERVER_URL_PROD : process.env.SERVER_URL_DEV;

const facebookLogin = new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: `${serverUrl}${process.env.FACEBOOK_CALLBACK_URL}`,
    proxy: true,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Validate input
      if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
        return done(null, false, { message: 'Email not provided by Facebook' });
      }
      if (!profile.name || !profile.name.givenName || !profile.name.familyName) {
        return done(null, false, { message: 'Name not provided by Facebook' });
      }

      const oldUser = await User.findOne({ email: profile.emails[0].value });

      if (oldUser) {
        console.log('FACEBOOK LOGIN => found user', oldUser);
        return done(null, oldUser);
      }

      const newUser = await new User({
        provider: 'facebook',
        facebookId: profile.id,
        username: profile.name.givenName + profile.name.familyName,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos && profile.photos[0] && profile.photos[0].value,
      }).save();

      done(null, newUser);
    } catch (err) {
      // Handle errors
      console.error(err);
      done(err);
    }
  }
);

passport.use(facebookLogin);
