const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { createSocialUser, handleExistingUser } = require('./process');
const { findUser } = require('~/models');

const socialLogin =
  (provider, getProfileDetails) => async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const existingUser = await findUser({ email: email.trim() });
      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);

      if (existingUser?.provider === provider) {
        await handleExistingUser(existingUser, avatarUrl);
        return cb(null, existingUser);
      } else if (existingUser) {
        const error = new Error('auth_failed');
        error.code = 'auth_failed';
        error.provider = existingUser.provider;
        return cb(error);
      }

      if (ALLOW_SOCIAL_REGISTRATION) {
        const newUser = await createSocialUser({
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
