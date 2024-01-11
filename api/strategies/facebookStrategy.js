const FacebookStrategy = require('passport-facebook').Strategy;
const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const User = require('~/models/User');

const facebookLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0]?.value;
    const facebookId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0]?.value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser({
        email,
        avatarUrl,
        provider: 'facebook',
        providerKey: 'facebookId',
        providerId: facebookId,
        username: profile.displayName,
        name: profile.name?.givenName + ' ' + profile.name?.familyName,
      });
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[facebookLogin]', err);
    return cb(err);
  }
};

module.exports = () =>
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookLogin,
  );
