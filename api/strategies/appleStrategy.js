const { User } = require('~/models');
const AppleStrategy = require('passport-apple');
const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const jwt = require('jsonwebtoken');

const appleLogin = async (req, accessToken, refreshToken, idToken, profile, cb) => {
  console.log('access', req, accessToken, refreshToken, jwt.decode(idToken), profile);
  try {
    const email = profile.emails[0].value;
    const googleId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0].value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser({
        email,
        avatarUrl,
        provider: 'google',
        providerKey: 'googleId',
        providerId: googleId,
        username: profile.name.givenName,
        name: `${profile.name.givenName} ${profile.name.familyName}`,
        emailVerified: profile.emails[0].verified,
      });
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[appleLogin]', err);
    return cb(err);
  }
};;

module.exports = () =>
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.APPLE_CALLBACK_URL}`,
      keyID: process.env.APPLE_KEY_ID,
      // privateKeyLocation: '',
    },
    appleLogin,
  );
