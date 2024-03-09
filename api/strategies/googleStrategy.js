const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const User = require('~/models/User');

const googleLogin = async (accessToken, refreshToken, profile, cb) => {
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
    logger.error('[googleLogin]', err);
    return cb(err);
  }
};

module.exports = () =>
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GOOGLE_CALLBACK_URL}`,
      proxy: true,
    },
    googleLogin,
  );
