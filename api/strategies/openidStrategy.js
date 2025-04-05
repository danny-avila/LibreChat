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

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}

/**
 * Downloads an image from a URL using an access token, returning a Buffer.
 *
 * @async
 * @function downloadImage
 * @param {string} url - The image URL
 * @param {string} accessToken - The OAuth2 access token, if required by the server
 * @returns {Promise<Buffer|string>} A Buffer if successful, or an empty string on failure
 */
async function downloadImage(url, accessToken) {
  if (!url) {
    return '';
  }

  try {
    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    };
    if (process.env.PROXY) {
      options.agent = new HttpsProxyAgent(process.env.PROXY);
    }

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
    return await response.buffer();
  } catch (error) {
    logger.error(`[openidStrategy] downloadImage: Failed to fetch "${url}": ${error}`);
    return '';
  }
}

/**
 * Derives a user's "full name" from userinfo or environment-specified claim.
 *
 * Priority:
 * 1) process.env.OPENID_NAME_CLAIM
 * 2) userinfo.given_name + userinfo.family_name
 * 3) userinfo.given_name OR userinfo.family_name
 * 4) userinfo.username or userinfo.email
 *
 * @function getFullName
 * @param {Object} userinfo - The user information object from OpenID Connect
 * @param {string} [userinfo.given_name] - The user's first name
 * @param {string} [userinfo.family_name] - The user's last name
 * @param {string} [userinfo.username] - The user's username
 * @param {string} [userinfo.email] - The user's email address
 * @returns {string} The determined full name of the user
 */
function getFullName(userinfo) {
  if (process.env.OPENID_NAME_CLAIM && userinfo[process.env.OPENID_NAME_CLAIM]) {
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
  return userinfo.username || userinfo.email || '';
}

/**
 * Converts an input into a string suitable for a username.
 *
 * @function convertToUsername
 * @param {string|string[]|undefined} input - Could be a string or array of strings
 * @param {string} [defaultValue=''] - Fallback if input is invalid or not provided
 * @returns {string} A processed username string
 */
function convertToUsername(input, defaultValue = '') {
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.join('_');
  }
  return defaultValue;
}

/**
 * Safely extracts an array of roles from an object using dot notation (e.g. realm_access.roles).
 *
 * @function extractRolesFrom
 * @param {Object} obj
 * @param {string} path
 * @returns {string[]} Array of roles, or empty array if not found
 */
function extractRolesFrom(obj, path) {
  try {
    let current = obj;
    for (const part of path.split('.')) {
      if (!current || typeof current !== 'object') {
        return [];
      }
      current = current[part];
    }
    return Array.isArray(current) ? current : [];
  } catch {
    return [];
  }
}

/**
 * Retrieves user roles from either a token or the userinfo, based on configuration.
 *
 * @function getUserRoles
 * @param {import('openid-client').TokenSet} tokenSet
 * @param {Object} userinfo
 * @param {string} rolePath - Dot-notation path to where roles are stored
 * @param {'access'|'id'} tokenKind - Which token to parse for roles
 * @param {'token'|'userinfo'} roleSource - Whether to start with token or userinfo
 * @returns {string[]} Array of roles, possibly empty
 */
function getUserRoles(tokenSet, userinfo, rolePath, tokenKind, roleSource) {
  if (!tokenSet) {
    return [];
  }

  // If roles should come from userinfo first
  if (roleSource === 'userinfo') {
    const roles = extractRolesFrom(userinfo, rolePath);
    if (!roles.length) {
      logger.warn(`[openidStrategy] Key '${rolePath}' not found in userinfo.`);
    }
    return roles;
  }

  // Otherwise, try from the token
  let tokenToDecode;
  try {
    tokenToDecode = tokenKind === 'access' ? tokenSet.access_token : tokenSet.id_token;
    if (!tokenToDecode || !tokenToDecode.includes('.')) {
      throw new Error('Token is not a valid JWT for decoding.');
    }
  } catch (err) {
    logger.error(`[openidStrategy] ${err}. Falling back to userinfo for role extraction.`);
    return extractRolesFrom(userinfo, rolePath);
  }

  let tokenData;
  try {
    tokenData = jwtDecode(tokenToDecode);
  } catch (err) {
    logger.error(`[openidStrategy] Failed to decode ${tokenKind} token: ${err}. Using userinfo.`);
    return extractRolesFrom(userinfo, rolePath);
  }

  const roles = extractRolesFrom(tokenData, rolePath);
  if (!roles.length) {
    logger.warn(
      `[openidStrategy] Key '${rolePath}' not found in ${tokenKind} token. Falling back to userinfo.`,
    );
    return extractRolesFrom(userinfo, rolePath);
  }
  return roles;
}

/**
 * Registers and configures the OpenID Connect strategy with Passport, enabling PKCE.
 *
 * @async
 * @function setupOpenId
 * @returns {Promise<void>}
 */
async function setupOpenId() {
  try {
    // Set up a proxy if specified
    if (process.env.PROXY) {
      const proxyAgent = new HttpsProxyAgent(process.env.PROXY);
      custom.setHttpOptionsDefaults({ agent: proxyAgent });
      logger.info(`[openidStrategy] Using proxy: ${process.env.PROXY}`);
    }

    // Discover issuer configuration
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    logger.info(`[openidStrategy] Discovered issuer: ${issuer.issuer}`);
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
      client_secret: process.env.OPENID_CLIENT_SECRET || '',
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    };

    // Optionally force the first supported signing algorithm
    if (isEnabled(process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM)) {
      clientMetadata.id_token_signed_response_alg =
        issuer.id_token_signing_alg_values_supported?.[0] || 'RS256';
    }

    const client = new issuer.Client(clientMetadata);

    // If you want a refresh token, add offline_access to scope, e.g. 'openid profile email offline_access'
    const openidScope = process.env.OPENID_SCOPE || 'openid profile email';
    const params = {
      scope: openidScope,
      code_challenge_method: 'S256', // PKCE
      response_type: 'code',
    };

    // Role-based config
    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const rolePath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const tokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND || 'id'; // 'id'|'access'
    const roleSource = process.env.OPENID_REQUIRED_ROLE_SOURCE || 'token'; // 'token'|'userinfo'

    // Create the Passport strategy
    const openidStrategy = new OpenIDStrategy(
      { client, params },
      async (tokenSet, userinfo, done) => {
        try {
          logger.info(`[openidStrategy] Verifying login for sub=${userinfo.sub}`);

          // Find user by openidId or fallback to email
          let user = await findUser({ openidId: userinfo.sub });
          if (!user && userinfo.email) {
            user = await findUser({ email: userinfo.email });
            logger.info(
              `[openidStrategy] User ${user ? 'found' : 'not found'} by email=${userinfo.email}.`,
            );
          }

          // If a role is required, check user roles
          if (requiredRole && rolePath) {
            const roles = getUserRoles(tokenSet, userinfo, rolePath, tokenKind, roleSource);
            if (!roles.includes(requiredRole)) {
              logger.warn(
                `[openidStrategy] Missing required role "${requiredRole}". Roles: [${roles.join(', ')}]`,
              );
              return done(null, false, {
                message: `You must have the "${requiredRole}" role to log in.`,
              });
            }
          }

          // Derive name and username
          const fullName = getFullName(userinfo);
          const username = process.env.OPENID_USERNAME_CLAIM
            ? convertToUsername(userinfo[process.env.OPENID_USERNAME_CLAIM])
            : convertToUsername(userinfo.username || userinfo.given_name || userinfo.email);

          // Create or update user
          if (!user) {
            logger.info(`[openidStrategy] Creating a new user for sub=${userinfo.sub}`);
            user = await createUser(
              {
                provider: 'openid',
                openidId: userinfo.sub,
                username,
                email: userinfo.email || '',
                emailVerified: Boolean(userinfo.email_verified) || false,
                name: fullName,
              },
              true,
              true,
            );
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = username;
            user.name = fullName;
          }

          // Fetch avatar if not manually overridden
          if (userinfo.picture && !String(user.avatar || '').includes('manual=true')) {
            const imageBuffer = await downloadImage(userinfo.picture, tokenSet.access_token);
            if (imageBuffer) {
              const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
              const fileHash = crypto ? await hashToken(userinfo.sub) : userinfo.sub;
              const fileName = `${fileHash}.png`;

              const imagePath = await saveBuffer({
                fileName,
                userId: user._id.toString(),
                buffer: imageBuffer,
              });
              if (imagePath) {
                user.avatar = imagePath;
              }
            }
          }

          // Persist user changes
          user = await updateUser(user._id, user);

          // Success
          logger.info(
            `[openidStrategy] Login success for sub=${user.openidId}, email=${user.email}, username=${user.username}`,
          );
          return done(null, user);
        } catch (err) {
          logger.error('[openidStrategy] Login verification failed:', err);
          return done(err);
        }
      },
    );

    // Register the strategy under the 'openid' name
    passport.use('openid', openidStrategy);
  } catch (err) {
    logger.error('[openidStrategy] Error setting up OpenID strategy:', err);
  }
}

module.exports = setupOpenId;
