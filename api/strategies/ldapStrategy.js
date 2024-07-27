const fs = require('fs');
const LdapStrategy = require('passport-ldapauth');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { isEnabled } = require('~/server/utils');
const logger = require('~/utils/logger');

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
  LDAP_TLS_REJECT_UNAUTHORIZED,
} = process.env;

// Check required environment variables
if (!LDAP_URL || !LDAP_USER_SEARCH_BASE) {
  return null;
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
const rejectUnauthorized = isEnabled(LDAP_TLS_REJECT_UNAUTHORIZED);

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
  },
  usernameField: 'email',
  passwordField: 'password',
};

const ldapLogin = new LdapStrategy(ldapOptions, async (userinfo, done) => {
  if (!userinfo) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  if (!userinfo.mail) {
    logger.warn(
      '[ldapStrategy]',
      'No email attributes found in userinfo',
      JSON.stringify(userinfo, null, 2),
    );
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

    if (!user) {
      user = {
        provider: 'ldap',
        ldapId,
        username,
        email: userinfo.mail,
        emailVerified: true, // The ldap server administrator should verify the email
        name: fullName,
      };
      const userId = await createUser(user);
      user._id = userId;
    } else {
      // Users registered in LDAP are assumed to have their user information managed in LDAP,
      // so update the user information with the values registered in LDAP
      user.provider = 'ldap';
      user.ldapId = ldapId;
      user.email = userinfo.mail;
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
