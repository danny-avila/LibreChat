const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

// facebook strategy
const facebookLogin = new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_SECRET,
    callbackURL: `${domains.server}${process.env.FACEBOOK_CALLBACK_URL}`,
    proxy: true,
    // profileFields: [
    //   'id',
    //   'email',
    //   'gender',
    //   'profileUrl',
    //   'displayName',
    //   'locale',
    //   'name',
    //   'timezone',
    //   'updated_time',
    //   'verified',
    //   'picture.type(large)'
    // ]
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('facebookLogin => profile', profile);
    try {
      const oldUser = await User.findOne({ email: profile.emails[0].value });

      if (oldUser) {
        console.log('FACEBOOK LOGIN => found user', oldUser);
        return done(null, oldUser);
      }
    } catch (err) {
      console.log(err);
    }

    // register user
    try {
      const newUser = await new User({
        provider: 'facebook',
        facebookId: profile.id,
        username: profile.name.givenName + profile.name.familyName,
        email: profile.emails[0].value,
        name: profile.displayName,
        avatar: profile.photos[0].value,
      }).save();

      done(null, newUser);
    } catch (err) {
      console.log(err);
    }
  },
);

passport.use(facebookLogin);
