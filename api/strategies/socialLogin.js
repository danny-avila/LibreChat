const { logger } = require('@librechat/data-schemas');
const resolveSocialLogin = require('~/server/services/auth/resolveSocialLogin');

const socialLogin =
  (provider, getProfileDetails) => async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const identity = getProfileDetails({
        idToken,
        profile,
      });
      const user = await resolveSocialLogin(provider, identity);
      return cb(null, user);
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
