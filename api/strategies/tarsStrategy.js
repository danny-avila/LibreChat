const { Strategy: PassportLocalStrategy } = require('passport-local');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles, ErrorTypes } = require('librechat-data-provider');
const {
  authenticateTars,
  getBalanceConfig,
  isEmailDomainAllowed,
  resolveAppConfigForUser,
} = require('@librechat/api');
const { createUser, findUser, updateUser, countUsers } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const { TARS_AUTH_URL } = process.env;

if (!TARS_AUTH_URL) {
  module.exports = null;
}

const tarsLogin = new PassportLocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
    session: false,
    passReqToCallback: false,
  },
  async (username, password, done) => {
    try {
      const tarsUser = await authenticateTars(username, password);
      if (!tarsUser) {
        return done(null, false, { message: ErrorTypes.AUTH_FAILED });
      }

      const { id: tarsId, email, name } = tarsUser;
      const mail = email || `${tarsUser.username}@tars.local`;

      const baseConfig = await getAppConfig({ baseOnly: true });
      if (!isEmailDomainAllowed(mail, baseConfig?.registration?.allowedDomains)) {
        logger.error(
          `[tarsStrategy] Authentication blocked - email domain not allowed [Email: ${mail}]`,
        );
        return done(null, false, { message: 'Email domain not allowed' });
      }

      let user = await findUser({ tarsId });
      if (user && user.provider !== 'tars') {
        logger.info(
          `[tarsStrategy] User ${user.email} already exists with provider ${user.provider}`,
        );
        return done(null, false, { message: ErrorTypes.AUTH_FAILED });
      }

      const appConfig = user?.tenantId
        ? await resolveAppConfigForUser(getAppConfig, user)
        : baseConfig;

      if (!isEmailDomainAllowed(mail, appConfig?.registration?.allowedDomains)) {
        logger.error(
          `[tarsStrategy] Authentication blocked - email domain not allowed [Email: ${mail}]`,
        );
        return done(null, false, { message: 'Email domain not allowed' });
      }

      if (!user) {
        const isFirstRegisteredUser = (await countUsers()) === 0;
        user = {
          provider: 'tars',
          tarsId,
          username: tarsUser.username,
          email: mail,
          emailVerified: true,
          name,
          role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
        };
        const balanceConfig = getBalanceConfig(appConfig);
        const userId = await createUser(user, balanceConfig);
        user._id = userId;
      } else {
        user.provider = 'tars';
        user.tarsId = tarsId;
        user.email = mail;
        user.username = tarsUser.username;
        user.name = name;
      }

      user = await updateUser(user._id, user);
      done(null, user);
    } catch (err) {
      logger.error('[tarsStrategy]', err);
      done(err);
    }
  },
);

module.exports = tarsLogin;
