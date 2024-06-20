const fs = require('fs');
const LdapStrategy = require('passport-ldapauth');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
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
  LDAP_STRICT_LOGIN,
} = process.env;

// Check required environment variables
if (!LDAP_URL || !LDAP_USER_SEARCH_BASE) {
  throw new Error('Missing required LDAP environment variables');
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

const strictLogin = LDAP_STRICT_LOGIN === undefined || LDAP_STRICT_LOGIN.toLowerCase() === 'true';

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
    let user = await findUser({ email: userinfo.mail });

    if (strictLogin && user && user.provider !== 'ldap') {
      logger.info(`User is configured for a different authentication strategy: ${user.provider}`);
      return done(null, false, { message: 'Invalid credentials' });
    }

    const fullNameAttributes = LDAP_FULL_NAME && LDAP_FULL_NAME.split(',');
    const fullName =
      fullNameAttributes && fullNameAttributes.length > 0
        ? fullNameAttributes.map((attr) => userinfo[attr]).join(' ')
        : userinfo.cn || userinfo.name || userinfo.commonname || userinfo.displayName;

    const username =
      (LDAP_USERNAME && userinfo[LDAP_USERNAME]) || userinfo.givenName || userinfo.mail;

    const ldapId =
      (LDAP_ID && userinfo[LDAP_ID]) || userinfo.uid || userinfo.sAMAccountName || userinfo.email;

    if (!user) {
      let ldapUser = await findUser({ ldapId });
      if (ldapUser && ldapUser.email !== userinfo.mail) {
        logger.info(`LDAP User ${ldapId} is already registered with email ${ldapUser.email}`);
        return done(null, false, { message: 'Invalid credentials' });
      }

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
