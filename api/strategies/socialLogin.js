const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, isEmailDomainAllowed } = require('@librechat/api');
const { createSocialUser, handleExistingUser } = require('./process');
const { getAppConfig } = require('~/server/services/Config');
const { findUser } = require('~/models');

const socialLogin =
  (provider, getProfileDetails) => async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const appConfig = await getAppConfig();

      if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
        logger.error(
          `[${provider}Login] Authentication blocked - email domain not allowed [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Email domain not allowed';
        return cb(error);
      }

      const providerKey = `${provider}Id`;
      let existingUser = null;

      /** First try to find user by provider ID (e.g., googleId, facebookId) */
      if (id && typeof id === 'string') {
        existingUser = await findUser({ [providerKey]: id });
      }

      /** If not found by provider ID, try finding by email */
      if (!existingUser) {
        existingUser = await findUser({ email: email?.trim() });
        if (existingUser) {
          logger.warn(`[${provider}Login] User found by email: ${email} but not by ${providerKey}`);
        }
      }

      if (existingUser?.provider === provider) {
        await handleExistingUser(existingUser, avatarUrl, appConfig, email);
        return cb(null, existingUser);
      } else if (existingUser) {
        logger.info(
          `[${provider}Login] User ${email} already exists with provider ${existingUser.provider}`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.provider = existingUser.provider;
        return cb(error);
      }

      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);
      if (!ALLOW_SOCIAL_REGISTRATION) {
        logger.error(
          `[${provider}Login] Registration blocked - social registration is disabled [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Social registration is disabled';
        return cb(error);
      }

      const newUser = await createSocialUser({
        email,
        avatarUrl,
        provider,
        providerKey: `${provider}Id`,
        providerId: id,
        username,
        name,
        emailVerified,
        appConfig,
      });
      return cb(null, newUser);
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
