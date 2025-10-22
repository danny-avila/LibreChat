const fs = require('fs');
const ldap = require('ldapjs');
const LdapStrategy = require('passport-ldapauth');
const { Strategy: CustomStrategy } = require('passport-custom');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles, ErrorTypes } = require('librechat-data-provider');
const { isEnabled, getBalanceConfig, isEmailDomainAllowed } = require('@librechat/api');
const { createUser, findUser, updateUser, countUsers } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const {
  LDAP_URL,
  LDAP_BIND_DN,
  LDAP_BIND_CREDENTIALS,
  LDAP_BIND_DN_TEMPLATE,
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

// Determine if we should use direct binding
const useDirectBind = LDAP_BIND_DN_TEMPLATE && !LDAP_BIND_DN && !LDAP_BIND_CREDENTIALS;

if (useDirectBind) {
  logger.info('[ldapStrategy] Using direct bind mode with template: ' + LDAP_BIND_DN_TEMPLATE);
}

const directBindStrategy = new CustomStrategy((req, done) => {
  const username = req.body.email; // This is the field name from the login form
  const password = req.body.password;
  const userDN = LDAP_BIND_DN_TEMPLATE.replace(/\{\{username\}\}/g, username);

  const clientOptions = {
    url: LDAP_URL,
  };

  if (LDAP_CA_CERT_PATH) {
    try {
      clientOptions.tlsOptions = {
        rejectUnauthorized,
        ca: [fs.readFileSync(LDAP_CA_CERT_PATH)],
      };
    } catch (err) {
      logger.error('[ldapStrategy]', 'Failed to read CA certificate', err);
      return done(err);
    }
  }

  const client = ldap.createClient(clientOptions);

  client.on('error', (err) => {
    logger.error('[ldapStrategy] LDAP client error:', err);
    client.unbind();
    return done(err);
  });

  // Attempt to bind with user credentials
  client.bind(userDN, password, (err) => {
    if (err) {
      logger.warn('[ldapStrategy] Direct bind failed for: ' + userDN);
      client.unbind();
      return done(null, false, { message: 'Invalid credentials' });
    }

    logger.info('[ldapStrategy] Direct bind successful for: ' + userDN);

    // After successful bind, search for user attributes
    const searchOptions = {
      scope: 'base',
      attributes: [...new Set(searchAttributes)],
    };

    client.search(userDN, searchOptions, (searchErr, searchRes) => {
      if (searchErr) {
        logger.error('[ldapStrategy] Search error after bind:', searchErr);
        client.unbind();
        return done(searchErr);
      }

      let userinfo = null;

      searchRes.on('searchEntry', (entry) => {
        userinfo = entry.object;
      });

      searchRes.on('error', (err) => {
        logger.error('[ldapStrategy] Search result error:', err);
        client.unbind();
        return done(err);
      });

      searchRes.on('end', async () => {
        client.unbind();

        if (!userinfo) {
          return done(null, false, { message: 'User not found after successful bind' });
        }

        // Process user info (same logic as standard LDAP)
        try {
          await processLdapUser(userinfo, done);
        } catch (err) {
          logger.error('[ldapStrategy]', err);
          done(err);
        }
      });
    });
  });
});

// Set strategy name for Passport registration
directBindStrategy.name = 'ldapauth';

// Common user processing logic
async function processLdapUser(userinfo, done) {
  const ldapId =
    (LDAP_ID && userinfo[LDAP_ID]) || userinfo.uid || userinfo.sAMAccountName || userinfo.mail;

  let user = await findUser({ ldapId });
  if (user && user.provider !== 'ldap') {
    logger.info(
      `[ldapStrategy] User ${user.email} already exists with provider ${user.provider}`,
    );
    return done(null, false, {
      message: ErrorTypes.AUTH_FAILED,
    });
  }

  const fullNameAttributes = LDAP_FULL_NAME && LDAP_FULL_NAME.split(',');
  const fullName =
    fullNameAttributes && fullNameAttributes.length > 0
      ? fullNameAttributes.map((attr) => userinfo[attr]).join(' ')
      : userinfo.cn || userinfo.name || userinfo.commonname || userinfo.displayName;

  const username =
    (LDAP_USERNAME && userinfo[LDAP_USERNAME]) || userinfo.givenName || userinfo.mail;

  let mail = (LDAP_EMAIL && userinfo[LDAP_EMAIL]) || userinfo.mail || username + '@ldap.local';
  mail = Array.isArray(mail) ? mail[0] : mail;

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

  const appConfig = await getAppConfig();
  if (!isEmailDomainAllowed(mail, appConfig?.registration?.allowedDomains)) {
    logger.error(
      `[LDAP Strategy] Authentication blocked - email domain not allowed [Email: ${mail}]`,
    );
    return done(null, false, { message: 'Email domain not allowed' });
  }

  if (!user) {
    const isFirstRegisteredUser = (await countUsers()) === 0;
    const role = isFirstRegisteredUser ? SystemRoles.ADMIN : SystemRoles.USER;

    user = {
      provider: 'ldap',
      ldapId,
      username,
      email: mail,
      emailVerified: true,
      name: fullName,
      role,
    };
    const balanceConfig = getBalanceConfig(appConfig);
    const userId = await createUser(user, balanceConfig);
    user._id = userId;
  } else {
    user.provider = 'ldap';
    user.ldapId = ldapId;
    user.email = mail;
    user.username = username;
    user.name = fullName;
  }

  user = await updateUser(user._id, user);
  done(null, user);
}

// Standard LDAP strategy with bind credentials
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

const standardLdapLogin = new LdapStrategy(ldapOptions, async (userinfo, done) => {
  if (!userinfo) {
    return done(null, false, { message: 'Invalid credentials' });
  }

  try {
    await processLdapUser(userinfo, done);
  } catch (err) {
    logger.error('[ldapStrategy]', err);
    done(err);
  }
});

// Export the appropriate strategy
// For CustomStrategy, we need to wrap it to give it a name property
if (useDirectBind) {
  directBindStrategy.name = 'ldapauth';
  module.exports = directBindStrategy;
} else {
  module.exports = standardLdapLogin;
}
