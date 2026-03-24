const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, isEmailDomainAllowed } = require('@librechat/api');
const {
  createSocialUser,
  handleExistingUser,
  migrateLocalUserToSocial,
} = require('~/strategies/process');
const { getAppConfig } = require('~/server/services/Config');
const { findUser } = require('~/models');

async function resolveSocialLogin(provider, identity) {
  const { email, id, avatarUrl, username, name, emailVerified } = identity;
  const appConfig = await getAppConfig();

  if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
    logger.error(
      `[${provider}Login] Authentication blocked - email domain not allowed [Email: ${email}]`,
    );
    const error = new Error(ErrorTypes.AUTH_FAILED);
    error.code = ErrorTypes.AUTH_FAILED;
    error.message = 'Email domain not allowed';
    throw error;
  }

  const existingUser = await findUser({ email: email.trim() });

  if (existingUser?.provider === provider) {
    await handleExistingUser(existingUser, avatarUrl, appConfig);
    return existingUser;
  }

  if (provider === 'google' && existingUser?.provider === 'local' && emailVerified) {
    logger.info(
      `[${provider}Login] Migrating existing local account to ${provider} [Email: ${email}]`,
    );
    return await migrateLocalUserToSocial({
      existingUser,
      avatarUrl,
      provider,
      providerKey: `${provider}Id`,
      providerId: id,
      appConfig,
      emailVerified,
    });
  }

  if (existingUser) {
    logger.info(
      `[${provider}Login] User ${email} already exists with provider ${existingUser.provider}`,
    );
    const error = new Error(ErrorTypes.AUTH_FAILED);
    error.code = ErrorTypes.AUTH_FAILED;
    error.provider = existingUser.provider;
    throw error;
  }

  const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);
  if (!ALLOW_SOCIAL_REGISTRATION) {
    logger.error(
      `[${provider}Login] Registration blocked - social registration is disabled [Email: ${email}]`,
    );
    const error = new Error(ErrorTypes.AUTH_FAILED);
    error.code = ErrorTypes.AUTH_FAILED;
    error.message = 'Social registration is disabled';
    throw error;
  }

  return await createSocialUser({
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
}

module.exports = resolveSocialLogin;
