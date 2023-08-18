const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

const facebookLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    console.log('facebookLogin => profile', profile);
    const email = profile.emails[0].value;
    const facebookId = profile.id;
    const oldUser = await User.findOne({
      email,
    });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';

    if (oldUser) {
      oldUser.avatar = profile.photos[0].value;
      await oldUser.save();
      return cb(null, oldUser);
    } else if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await new User({
        provider: 'facebook',
        facebookId,
        username: profile.name.givenName + profile.name.familyName,
        email,
        name: profile.displayName,
        avatar: profile.photos[0].value,
      }).save();

      return cb(null, newUser);
    }

    return cb(null, false, {
      message: 'User not found.',
    });
  } catch (err) {
    console.error(err);
    return cb(err);
  }
};

module.exports = () =>
  new FacebookStrategy(
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
    facebookLogin,
  );
