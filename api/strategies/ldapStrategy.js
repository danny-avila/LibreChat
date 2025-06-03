const fs = require('fs');
const LdapStrategy = require('passport-ldapauth');
const { SystemRoles } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const { createUser, findUser, updateUser, countUsers } = require('~/models');
const { getBalanceConfig } = require('~/server/services/Config');
const { isEnabled } = require('~/server/utils');

const {
  LDAP_URL,
  LDAP_BIND_DN,
  LDAP_BIND_CREDENTIALS,
  LDAP_USER_SEARCH_BASE,
  LDAP_SEARCH_FILTER,
  LDAP_CA_CERT_PATH,
  LDAP_FULL_NAME,
  LDAP_ID,
  LDAP_USERNAME,
  LDAP_EMAIL,
  LDAP_TLS_REJECT_UNAUTHORIZED,
  LDAP_STARTTLS,
} = process.env;

// Check required environment variables
if (!LDAP_URL || !LDAP_USER_SEARCH_BASE) {
  module.exports = null;
}

const searchAttributes = [
  'displayName',
  'mail',
  'uid',
  'cn',
  'name',
  'commonname',
  'givenName',
  'sn',
  'sAMAccountName',
];

if (LDAP_FULL_NAME) {
  searchAttributes.push(...LDAP_FULL_NAME.split(','));
}
if (LDAP_ID) {
  searchAttributes.push(LDAP_ID);
}
if (LDAP_USERNAME) {
  searchAttributes.push(LDAP_USERNAME);
}
if (LDAP_EMAIL) {
  searchAttributes.push(LDAP_EMAIL);
}
const rejectUnauthorized = isEnabled(LDAP_TLS_REJECT_UNAUTHORIZED);
const startTLS = isEnabled(LDAP_STARTTLS);

const ldapOptions = {
  server: {
    url: LDAP_URL,
    bindDN: LDAP_BIND_DN,
    bindCredentials: LDAP_BIND_CREDENTIALS,
    searchBase: LDAP_USER_SEARCH_BASE,
    searchFilter: LDAP_SEARCH_FILTER || 'mail={{username}}',
    searchAttributes: [...new Set(searchAttributes)],
    ...(LDAP_CA_CERT_PATH && {
      tlsOptions: {
        rejectUnauthorized,
        ca: (() => {
          try {
            return [fs.readFileSync(LDAP_CA_CERT_PATH)];
          } catch (err) {
            logger.error('[ldapStrategy]', 'Failed to read CA certificate', err);
            throw err;
          }
        })(),
      },
    }),
    ...(startTLS && { starttls: true }),
  },
  usernameField: 'email',
  passwordField: 'password',
};

const ldapLogin = new LdapStrategy(ldapOptions, async (userinfo, done) => {
  if (!userinfo) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  try {
    const ldapId =
      (LDAP_ID && userinfo[LDAP_ID]) || userinfo.uid || userinfo.sAMAccountName || userinfo.mail;

    let user = await findUser({ ldapId });

    const fullNameAttributes = LDAP_FULL_NAME && LDAP_FULL_NAME.split(',');
    const fullName =
      fullNameAttributes && fullNameAttributes.length > 0
        ? fullNameAttributes.map((attr) => userinfo[attr]).join(' ')
        : userinfo.cn || userinfo.name || userinfo.commonname || userinfo.displayName;

    const username =
      (LDAP_USERNAME && userinfo[LDAP_USERNAME]) || userinfo.givenName || userinfo.mail;

    const mail = (LDAP_EMAIL && userinfo[LDAP_EMAIL]) || userinfo.mail || username + '@ldap.local';

    if (!userinfo.mail && !(LDAP_EMAIL && userinfo[LDAP_EMAIL])) {
      logger.warn(
        '[ldapStrategy]',
        `No valid email attribute found in LDAP userinfo. Using fallback email: ${username}@ldap.local`,
        `LDAP_EMAIL env var: ${LDAP_EMAIL || 'not set'}`,
        `Available userinfo attributes: ${Object.keys(userinfo).join(', ')}`,
        'Full userinfo:',
        JSON.stringify(userinfo, null, 2),
      );
    }

    if (!user) {
      const isFirstRegisteredUser = (await countUsers()) === 0;
      user = {
        provider: 'ldap',
        ldapId,
        username,
        email: mail,
        emailVerified: true, // The ldap server administrator should verify the email
        name: fullName,
        role: isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER,
      };
      const balanceConfig = await getBalanceConfig();
      const userId = await createUser(user, balanceConfig);
      user._id = userId;
    } else {
      // Users registered in LDAP are assumed to have their user information managed in LDAP,
      // so update the user information with the values registered in LDAP
      user.provider = 'ldap';
      user.ldapId = ldapId;
      user.email = mail;
      user.username = username;
      user.name = fullName;
    }

    user = await updateUser(user._id, user);
    done(null, user);
  } catch (err) {
    logger.error('[ldapStrategy]', err);
    done(err);
  }
});

module.exports = ldapLogin;
