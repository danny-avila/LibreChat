const fetch = require('node-fetch');
const passport = require('passport');
const jwtDecode = require('jsonwebtoken/decode');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Issuer, Strategy: OpenIDStrategy, custom } = require('openid-client');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { hashToken } = require('~/server/utils/crypto');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');
const { SystemRoles } = require('librechat-data-provider');
const OpenIdDataMapper = require('./OpenId/openidDataMapper');

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
 * Decodes a JWT token safely.
 * @param {string} token
 * @returns {Object|null}
 */
function safeDecode(token) {
  try {
    const decoded = jwtDecode(token);
    if (decoded && typeof decoded === 'object') {
      return decoded;
    }
    logger.error('[openidStrategy] Decoded token is not an object.');
    return null;
  } catch (error) {
    logger.error('[openidStrategy] safeDecode: Error decoding token:', error);
    return null;
  }
}

/**
 * Extracts roles from a decoded token based on the provided path.
 * @param {Object} decodedToken
 * @param {string} parameterPath
 * @returns {string[]}
 */
function extractRolesFromToken(decodedToken, parameterPath) {
  if (!decodedToken) {
    return [];
  }

  const roles = parameterPath.split('.').reduce((obj, key) => (obj?.[key] ?? null), decodedToken);
  if (!Array.isArray(roles)) {
    logger.error('[openidStrategy] extractRolesFromToken: Roles extracted from token are not in array format.');
    return [];
  }

  return roles;
}

async function setupOpenId() {
  try {
    if (process.env.PROXY) {
      const proxyAgent = new HttpsProxyAgent(process.env.PROXY);
      custom.setHttpOptionsDefaults({
        agent: proxyAgent,
      });
      logger.info(`[openidStrategy] proxy agent added: ${process.env.PROXY}`);
    }
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    /* Supported Algorithms, openid-client v5 doesn't set it automatically as discovered from server.
      - id_token_signed_response_alg      // defaults to 'RS256'
      - request_object_signing_alg        // defaults to 'RS256'
      - userinfo_signed_response_alg      // not in v5
      - introspection_signed_response_alg // not in v5
      - authorization_signed_response_alg // not in v5
    */
    /** @type {import('openid-client').ClientMetadata} */
    const clientMetadata = {
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    };
    if (isEnabled(process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM)) {
      clientMetadata.id_token_signed_response_alg = issuer.id_token_signing_alg_values_supported?.[0] || 'RS256';
    }
    const client = new issuer.Client(clientMetadata);
    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
    const adminRole = process.env.OPENID_ADMIN_ROLE; // NEW: Admin role from environment
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
          logger.debug('[openidStrategy] very login tokenset and userinfo', { tokenset, userinfo });

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

          // NEW FEATURE: Initialize and populate custom OpenID data if OPENID_CUSTOM_DATA is set.
          let customOpenIdData = new Map();
          if (process.env.OPENID_CUSTOM_DATA) {
            const dataMapper = OpenIdDataMapper.getMapper(process.env.OPENID_PROVIDER.toLowerCase());
            customOpenIdData = await dataMapper.mapCustomData(tokenset.access_token, process.env.OPENID_CUSTOM_DATA);

            // Integrate raw token-based roles directly into customOpenIdData.
            const tokenBasedRoles =
                  requiredRole &&
                  extractRolesFromToken(
                    safeDecode(requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token),
                    requiredRoleParameterPath,
                  );
            if (tokenBasedRoles && tokenBasedRoles.length) {
              customOpenIdData.set('roles', tokenBasedRoles);
            } else {
              logger.warn('[openidStrategy] tokenBasedRoles is missing or invalid.');
            }
          }

          // NEW FEATURE: Determine system role based on token roles.
          const token = requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token;
          const decodedToken = safeDecode(token);
          const tokenBasedRoles = extractRolesFromToken(decodedToken, requiredRoleParameterPath);
          const isAdmin = tokenBasedRoles.includes(adminRole);
          const assignedRole = isAdmin ? SystemRoles.ADMIN : SystemRoles.USER;
          logger.debug(`[openidStrategy] Assigned system role: ${assignedRole} (isAdmin: ${isAdmin})`);

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
              role: assignedRole,
              customOpenIdData: customOpenIdData,
            };
            user = await createUser(user, true, true);
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = username;
            user.name = fullName;
            user.role = assignedRole;
            user.customOpenIdData = customOpenIdData;
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

    passport.use('openid', openidLogin);
  } catch (err) {
    logger.error('[openidStrategy]', err);
  }
}

module.exports = setupOpenId;