const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

const facebookLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0]?.value;
    const facebookId = profile.id;
    const oldUser = await User.findOne({
      email,
    });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';

    if (oldUser) {
      oldUser.avatar = profile.photo;
      await oldUser.save();
      return cb(null, oldUser);
    } else if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await new User({
        provider: 'facebook',
        facebookId,
        username: profile.displayName,
        email,
        name: profile.name?.givenName + ' ' + profile.name?.familyName,
        avatar: profile.photos[0]?.value,
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
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookLogin,
  );
