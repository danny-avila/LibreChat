const { Strategy: PassportLocalStrategy } = require('passport-local');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles, ErrorTypes } = require('librechat-data-provider');
const {
  isEnabled,
  authenticateTars,
  getBalanceConfig,
  isTarsAdminRole,
  isEmailDomainAllowed,
  flattenTarsMenuKeys,
  resolveAppConfigForUser,
} = require('@librechat/api');
const { createUser, findUser, updateUser } = require('~/models');
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
    passReqToCallback: true,
  },
  async (req, username, password, done) => {
    try {
      const useSso = isEnabled(req.body?.use_sso);
      const tarsUser = await authenticateTars(username, password, useSso);
      if (!tarsUser) {
        return done(null, false, { message: ErrorTypes.AUTH_FAILED });
      }

      const {
        id: tarsId,
        email,
        name,
        status,
        licenseStatus,
        roleId,
        groupIds,
        menuItems,
      } = tarsUser;
      if (status !== 'active') {
        logger.warn(`[tarsStrategy] Blocked non-active tars user [tarsId: ${tarsId}]`);
        return done(null, false, { message: ErrorTypes.AUTH_FAILED });
      }
      if (licenseStatus !== 'activate') {
        logger.warn(
          `[tarsStrategy] Blocked login - pwc_tars license not active [tarsId: ${tarsId}]`,
        );
        return done(null, false, { message: 'pwc_tars license is not active' });
      }

      const mail = email || `${tarsUser.username}@tars.local`;
      const role = isTarsAdminRole(roleId) ? SystemRoles.ADMIN : SystemRoles.USER;
      const tarsContext = {
        tarsStatus: status,
        tarsRoleId: roleId,
        tarsGroupIds: groupIds,
        tarsMenuItems: menuItems,
        tarsMenuKeys: flattenTarsMenuKeys(menuItems),
      };

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
        user = {
          provider: 'tars',
          tarsId,
          username: tarsUser.username,
          email: mail,
          emailVerified: true,
          name,
          role,
          ...tarsContext,
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
        user.role = role;
        Object.assign(user, tarsContext);
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
