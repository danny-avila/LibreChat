const fetch = require('node-fetch');
const passport = require('passport');
const { decode: jwtDecode } = require('jsonwebtoken');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Issuer, Strategy: OpenIDStrategy, custom } = require('openid-client');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { hashToken } = require('~/server/utils/crypto');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');
const { getOpenIdTenants } = require('~/server/utils/openidHelper');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}

/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @param {string} accessToken
 * @returns {Promise<Buffer>}
 */
const downloadImage = async (url, accessToken) => {
  if (!url) {
    return '';
  }

  try {
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };

    if (process.env.PROXY) {
      options.agent = new HttpsProxyAgent(process.env.PROXY);
    }

    const response = await fetch(url, options);

    if (response.ok) {
      const buffer = await response.buffer();
      return buffer;
    } else {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } catch (error) {
    logger.error(
      `[openidStrategy] downloadImage: Error downloading image at URL "${url}": ${error}`,
    );
    return '';
  }
};

/**
 * Determines the full name of a user based on OpenID userinfo and environment configuration.
 *
 * @param {Object} userinfo - The user information object from OpenID Connect
 * @param {string} [userinfo.given_name] - The user's first name
 * @param {string} [userinfo.family_name] - The user's last name
 * @param {string} [userinfo.username] - The user's username
 * @param {string} [userinfo.email] - The user's email address
 * @returns {string} The determined full name of the user
 */
function getFullName(userinfo) {
  if (process.env.OPENID_NAME_CLAIM) {
    return userinfo[process.env.OPENID_NAME_CLAIM];
  }

  if (userinfo.given_name && userinfo.family_name) {
    return `${userinfo.given_name} ${userinfo.family_name}`;
  }

  if (userinfo.given_name) {
    return userinfo.given_name;
  }

  if (userinfo.family_name) {
    return userinfo.family_name;
  }

  return userinfo.username || userinfo.email;
}

/**
 * Converts an input into a string suitable for a username.
 * If the input is a string, it will be returned as is.
 * If the input is an array, elements will be joined with underscores.
 * In case of undefined or other falsy values, a default value will be returned.
 *
 * @param {string | string[] | undefined} input - The input value to be converted into a username.
 * @param {string} [defaultValue=''] - The default value to return if the input is falsy.
 * @returns {string} The processed input as a string suitable for a username.
 */
function convertToUsername(input, defaultValue = '') {
  if (typeof input === 'string') {
    return input;
  } else if (Array.isArray(input)) {
    return input.join('_');
  }

  return defaultValue;
}

/**
 * Sets up a single OpenID strategy for the given tenant configuration.
 * @param {Object} tenant - The tenant’s OpenID config (issuer, clientId, etc.).
 * @param {string} tenant.issuer
 * @param {string} tenant.clientId
 * @param {string} tenant.clientSecret
 * @param {string} strategyName - Unique name for the strategy.
 */
async function setupSingleStrategy(tenant, strategyName) {
  try {
    // Discover the issuer (this performs the .well-known lookup).
    const issuer = await Issuer.discover(tenant.issuer);
    /* Supported Algorithms, openid-client v5 doesn't set it automatically as discovered from server.
      - id_token_signed_response_alg      // defaults to 'RS256'
      - request_object_signing_alg        // defaults to 'RS256'
      - userinfo_signed_response_alg      // not in v5
      - introspection_signed_response_alg // not in v5
      - authorization_signed_response_alg // not in v5
    */
    /** @type {import('openid-client').ClientMetadata} */
    const clientMetadata = {
      client_id: tenant.clientId,
      client_secret: tenant.clientSecret,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    };
    if (isEnabled(process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM)) {
      clientMetadata.id_token_signed_response_alg =
        issuer.id_token_signing_alg_values_supported?.[0] || 'RS256';
    }
    const client = new issuer.Client(clientMetadata);
    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE,
        },
      },
      async (tokenset, userinfo, done) => {
        try {
          logger.info(`[openidStrategy] verify login openidId: ${userinfo.sub}`);
          logger.debug('[openidStrategy] verify login tokenset and userinfo', { tokenset, userinfo });

          let user = await findUser({ openidId: userinfo.sub });
          logger.info(
            `[openidStrategy] user ${user ? 'found' : 'not found'} with openidId: ${userinfo.sub}`,
          );

          if (!user) {
            user = await findUser({ email: userinfo.email });
            logger.info(
              `[openidStrategy] user ${user ? 'found' : 'not found'} with email: ${
                userinfo.email
              } for openidId: ${userinfo.sub}`,
            );
          }

          const fullName = getFullName(userinfo);

          if (requiredRole) {
            let decodedToken = '';
            if (requiredRoleTokenKind === 'access') {
              decodedToken = jwtDecode(tokenset.access_token);
            } else if (requiredRoleTokenKind === 'id') {
              decodedToken = jwtDecode(tokenset.id_token);
            }
            const pathParts = requiredRoleParameterPath.split('.');
            let found = true;
            let roles = pathParts.reduce((o, key) => {
              if (o === null || o === undefined || !(key in o)) {
                found = false;
                return [];
              }
              return o[key];
            }, decodedToken);

            if (!found) {
              logger.error(
                `[openidStrategy] Key '${requiredRoleParameterPath}' not found in ${requiredRoleTokenKind} token!`,
              );
            }

            if (!roles.includes(requiredRole)) {
              return done(null, false, {
                message: `You must have the "${requiredRole}" role to log in.`,
              });
            }
          }

          let username = '';
          if (process.env.OPENID_USERNAME_CLAIM) {
            username = userinfo[process.env.OPENID_USERNAME_CLAIM];
          } else {
            username = convertToUsername(
              userinfo.username || userinfo.given_name || userinfo.email,
            );
          }

          if (!user) {
            user = {
              provider: 'openid',
              openidId: userinfo.sub,
              username,
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: fullName,
            };
            user = await createUser(user, true, true);
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = username;
            user.name = fullName;
          }

          if (userinfo.picture && !user.avatar?.includes('manual=true')) {
            /** @type {string | undefined} */
            const imageUrl = userinfo.picture;

            let fileName;
            if (crypto) {
              fileName = (await hashToken(userinfo.sub)) + '.png';
            } else {
              fileName = userinfo.sub + '.png';
            }

            const imageBuffer = await downloadImage(imageUrl, tokenset.access_token);
            if (imageBuffer) {
              const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
              const imagePath = await saveBuffer({
                fileName,
                userId: user._id.toString(),
                buffer: imageBuffer,
              });
              user.avatar = imagePath ?? '';
            }
          }

          user = await updateUser(user._id, user);

          logger.info(
            `[openidStrategy] login success openidId: ${user.openidId} | email: ${user.email} | username: ${user.username} `,
            {
              user: {
                openidId: user.openidId,
                username: user.username,
                email: user.email,
                name: user.name,
              },
            },
          );

          done(null, user);
        } catch (err) {
          logger.error('[openidStrategy] login failed', err);
          done(err);
        }
      },
    );

    passport.use(strategyName, openidLogin);
    logger.info(`Configured OpenID strategy [${strategyName}] for issuer: ${tenant.issuer}`);
  } catch (err) {
    logger.error(`[openidStrategy] Error configuring strategy "${strategyName}":`, err);
  }
}

/**
 * Reads the YAML configuration and registers strategies for multi-tenant OpenID Connect.
 */
async function setupOpenId() {
  try {
    // If a proxy is configured, set it for openid-client.

    // Set global HTTP options for openid-client
    if (process.env.PROXY) {
      const proxyAgent = new HttpsProxyAgent(process.env.PROXY);
      custom.setHttpOptionsDefaults({
        agent: proxyAgent,
        timeout: 10000,  // 10,000ms = 10 seconds
      });
      logger.info(`[openidStrategy] Proxy agent added: ${process.env.PROXY} with timeout 10000ms`);
    } else {
      custom.setHttpOptionsDefaults({
        timeout: 10000,  // Increase the default timeout
      });
      logger.info('[openidStrategy] Set default timeout to 10000ms');
    }

    const tenants = await getOpenIdTenants();

    // Global mapping: tenant name (lowercase) -> strategy name.
    const tenantMapping = new Map();

    // If there is one tenant with no domains specified, register it as the default "openid" strategy.
    if (tenants.length === 1 && (!tenants[0].domains || tenants[0].domains.trim() === '')) {
      await setupSingleStrategy(tenants[0].openid, 'openid');
      tenantMapping.set(tenants[0].name?.trim().toLowerCase() || 'openid', 'openid');
      logger.info('Configured single-tenant OpenID strategy as "openid"');
    } else {
      // Otherwise, iterate over each tenant.
      for (const tenantCfg of tenants) {
        const openidCfg = tenantCfg.openid;
        let strategyName = 'openid';
        if (tenantCfg.name && tenantCfg.name.trim()) {
          strategyName = `openid_${tenantCfg.name.trim()}`;
        }else {
          logger.warn(
            `[openidStrategy] Tenant with issuer ${openidCfg.issuer} has no domains specified; defaulting strategy name to "openid".`,
          );
        }
        await setupSingleStrategy(openidCfg, strategyName);
        if (tenantCfg.name && tenantCfg.name.trim()) {
          tenantMapping.set(tenantCfg.name.trim().toLowerCase(), strategyName);
        }
      }
    }
    // Store the tenant mapping globally so that the helper can choose the correct strategy.
    global.__openidTenantMapping = tenantMapping;
  } catch (err) {
    logger.error('[openidStrategy]', err);
  }
}

module.exports = setupOpenId;
