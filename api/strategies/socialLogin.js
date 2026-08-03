const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, isEmailDomainAllowed, resolveAppConfigForUser } = require('@librechat/api');
const { createSocialUser, handleExistingUser } = require('./process');
const { getAppConfig } = require('~/server/services/Config');
const { findUser, updateUser } = require('~/models');

const socialLogin =
  (provider, getProfileDetails, options = {}) =>
  async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const baseConfig = await getAppConfig({ baseOnly: true });
      if (!isEmailDomainAllowed(email, baseConfig?.registration?.allowedDomains)) {
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

      // Deletion barrier: a user whose destructive cascade (or deferred sweep) is
      // running must not mint a fresh session that admits writes behind it.
      if (existingUser?.deletionRequestedAt != null) {
        logger.warn(`[${provider}Login] Refusing login for deleting user: ${existingUser._id}`);
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Account deletion in progress';
        return cb(error);
      }

      const appConfig = existingUser?.tenantId
        ? await resolveAppConfigForUser(getAppConfig, existingUser)
        : baseConfig;

      if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
        logger.error(
          `[${provider}Login] Authentication blocked - email domain not allowed [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Email domain not allowed';
        return cb(error);
      }

      const passResult = (user) =>
        refreshToken && provider === 'google' ? cb(null, user, { refreshToken }) : cb(null, user);

      if (existingUser?.provider === provider) {
        if (
          options.existingUsersOnly &&
          id &&
          existingUser[providerKey] &&
          existingUser[providerKey] !== id
        ) {
          logger.warn(
            `[${provider}Login] Rejected admin email fallback for ${email}: stored ${providerKey} does not match`,
          );
          const error = new Error(ErrorTypes.AUTH_FAILED);
          error.code = ErrorTypes.AUTH_FAILED;
          return cb(error);
        }
        if (options.existingUsersOnly && id && !existingUser[providerKey]) {
          if (existingUser.tenantId) {
            logger.warn(
              `[${provider}Login] Admin migrate blocked for tenanted user ${email}: no tenant scope in OAuth callback`,
            );
            const tenantError = new Error(ErrorTypes.AUTH_FAILED);
            tenantError.code = ErrorTypes.AUTH_FAILED;
            return cb(tenantError);
          }
          await updateUser(existingUser._id, { [providerKey]: id });
          const verified = await findUser({ _id: existingUser._id, [providerKey]: id });
          if (!verified) {
            logger.warn(
              `[${provider}Login] Admin migrate superseded by concurrent write, denying: ${email}`,
            );
            const concurrentError = new Error(ErrorTypes.AUTH_FAILED);
            concurrentError.code = ErrorTypes.AUTH_FAILED;
            return cb(concurrentError);
          }
          existingUser[providerKey] = id;
        }
        await handleExistingUser(existingUser, avatarUrl, appConfig, email);
        // FINAL barrier recheck at the successful-login boundary, sequenced after
        // the slow awaits above (config resolution, avatar refresh): a barrier
        // raised mid-callback would otherwise mint a session whose oauthHandler
        // and setBalanceConfig writes recreate records the cascade deleted. A null
        // read fails closed — an identity removed mid-flow must not complete.
        let barrier = null;
        try {
          barrier = await findUser({ _id: existingUser._id }, 'deletionRequestedAt');
        } catch {
          barrier = null;
        }
        if (barrier == null || barrier.deletionRequestedAt != null) {
          logger.warn(
            `[${provider}Login] Refusing login for ${existingUser._id}: deletion barrier raised or unverifiable`,
          );
          const error = new Error(ErrorTypes.AUTH_FAILED);
          error.code = ErrorTypes.AUTH_FAILED;
          error.message = 'Account deletion in progress';
          return cb(error);
        }
        return passResult(existingUser);
      } else if (existingUser) {
        logger.info(
          `[${provider}Login] User ${email} already exists with provider ${existingUser.provider}`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.provider = existingUser.provider;
        return cb(error);
      }

      if (options.existingUsersOnly) {
        logger.error(
          `[${provider}Login] Admin auth blocked - user does not exist [Email: ${email}]`,
        );
        return cb(null, false, { message: 'User does not exist' });
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

      // Registration-boundary recheck, sequenced after the slow config awaits: a
      // barrier raised (or an account created) since the lookups above must not be
      // shadowed by a fresh document with the same email. A document ABSENT here is
      // a legitimate fresh registration — the interactive cascade removes the user
      // document last, so absence means any prior deletion already completed (the
      // admin path defers its cascade, but that cascade is keyed to the old _id).
      const trimmedEmail = typeof email === 'string' ? email.trim() : '';
      if (trimmedEmail !== '') {
        let priorAccount = null;
        let priorAccountConclusive = true;
        try {
          priorAccount = await findUser({ email: trimmedEmail }, 'deletionRequestedAt');
        } catch {
          priorAccountConclusive = false;
        }
        if (!priorAccountConclusive || priorAccount != null) {
          logger.warn(
            `[${provider}Login] Refusing registration for ${trimmedEmail}: account appeared or barrier unverifiable`,
          );
          const error = new Error(ErrorTypes.AUTH_FAILED);
          error.code = ErrorTypes.AUTH_FAILED;
          error.message = 'Account state changed during sign-in, please retry';
          return cb(error);
        }
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
      return passResult(newUser);
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
