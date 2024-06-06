const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const { findUserByEmail } = require('~/server/services/UserService');
const { isEnabled } = require('~/server/utils');

const socialLogin =
  (provider, getProfileDetails) => async (accessToken, refreshToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails(profile);

      const oldUser = await findUserByEmail(email);
      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);

      if (oldUser) {
        await handleExistingUser(oldUser, avatarUrl);
        return cb(null, oldUser);
      }

      if (ALLOW_SOCIAL_REGISTRATION) {
        const newUser = await createNewUser({
          email,
          avatarUrl,
          provider,
          providerKey: `${provider}Id`,
          providerId: id,
          username,
          name,
          emailVerified,
        });
        return cb(null, newUser);
      }
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
