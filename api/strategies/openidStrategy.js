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
 * @returns {Promise<Buffer|string>}
 */
const downloadImage = async (url, accessToken) => {
  if (!url) {
    return '';
  }

  const options = {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    ...(process.env.PROXY && { agent: new HttpsProxyAgent(process.env.PROXY) }),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
    return await response.buffer();
  } catch (error) {
    logger.error(`[openidStrategy] Error downloading image at URL "${url}": ${error}`);
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
const getFullName = (userinfo) => {
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
};

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
const convertToUsername = (input, defaultValue = '') => {
  if (typeof input === 'string') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.join('_');
  }
  return defaultValue;
};

/**
 * Safely decodes a JWT token.
 * @param {string} token
 * @returns {Object|null}
 */
const safeDecode = (token) => {
  try {
    const decoded = jwtDecode(token);
    if (decoded && typeof decoded === 'object') {
      return decoded;
    }
    logger.error('[openidStrategy] Decoded token is not an object.');
  } catch (error) {
    logger.error('[openidStrategy] Error decoding token:', error);
  }
  return null;
};

/**
 * Extracts roles from a decoded token based on the provided path.
 * @param {Object} decodedToken
 * @param {string} parameterPath
 * @returns {string[]}
 */
const extractRolesFromToken = (decodedToken, parameterPath) => {
  if (!decodedToken) {
    return [];
  }
  if (!parameterPath) {
    return [];
  }
  const roles = parameterPath.split('.').reduce((obj, key) => obj?.[key] ?? null, decodedToken);
  if (!Array.isArray(roles)) {
    logger.error('[openidStrategy] Roles extracted from token are not in array format.');
    return [];
  }
  return roles;
};

/**
 * Updates the user's avatar if a valid picture URL is provided.
 * @param {Object} user
 * @param {string | undefined} pictureUrl - The URL of the user's avatar.
 * @param {string} accessToken
 * @returns {Promise<Object>} The updated user object.
 */
const updateUserAvatar = async (user, pictureUrl, accessToken) => {
  if (!pictureUrl || (user.avatar && user.avatar.includes('manual=true'))) {
    return user;
  }

  const fileName = crypto ? (await hashToken(user.openidId)) + '.png' : `${user.openidId}.png`;

  const imageBuffer = await downloadImage(pictureUrl, accessToken);
  if (imageBuffer) {
    const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
    const imagePath = await saveBuffer({
      fileName,
      userId: user._id.toString(),
      buffer: imageBuffer,
    });
    user.avatar = imagePath ?? '';
  }
  return user;
};

async function setupOpenId() {
  try {
    // Configure proxy if defined.
    if (process.env.PROXY) {
      const proxyAgent = new HttpsProxyAgent(process.env.PROXY);
      custom.setHttpOptionsDefaults({ agent: proxyAgent });
      logger.info(`[openidStrategy] Proxy agent added: ${process.env.PROXY}`);
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
      clientMetadata.id_token_signed_response_alg =
        issuer.id_token_signing_alg_values_supported?.[0] || 'RS256';
    }

    const client = new issuer.Client(clientMetadata);

    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
    const adminRolesEnv = process.env.OPENID_ADMIN_ROLE;
    const adminRoles = adminRolesEnv ? adminRolesEnv.split(',').map((role) => role.trim()) : [];

    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: { scope: process.env.OPENID_SCOPE },
      },
      async (tokenset, userinfo, done) => {
        try {
          logger.info(`[openidStrategy] Verifying login for openidId: ${userinfo.sub}`);
          logger.debug('[openidStrategy] Tokenset and userinfo:', { tokenset, userinfo });

          // Find an existing user by openidId or email.
          let user =
            (await findUser({ openidId: userinfo.sub })) ||
            (await findUser({ email: userinfo.email }));

          const fullName = getFullName(userinfo);
          const username = process.env.OPENID_USERNAME_CLAIM
            ? userinfo[process.env.OPENID_USERNAME_CLAIM]
            : convertToUsername(userinfo.username || userinfo.given_name || userinfo.email);

          // Use the token specified by configuration to extract roles.
          const token =
            requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token;
          const decodedToken = safeDecode(token);
          const tokenBasedRoles = extractRolesFromToken(decodedToken, requiredRoleParameterPath);

          // Ensure the required role exists.
          if (requiredRole && !tokenBasedRoles.includes(requiredRole)) {
            return done(null, false, {
              message: `You must have the "${requiredRole}" role to log in.`,
            });
          }

          // Determine system role.
          const isAdmin = tokenBasedRoles.some((role) => adminRoles.includes(role));
          const assignedRole = isAdmin ? SystemRoles.ADMIN : SystemRoles.USER;
          logger.debug(
            `[openidStrategy] Assigned system role: ${assignedRole} (isAdmin: ${isAdmin})`,
          );

          // Map custom OpenID data if configured.
          let customOpenIdData = {};
          if (process.env.OPENID_CUSTOM_DATA) {
            const dataMapper = OpenIdDataMapper.getMapper(
              process.env.OPENID_PROVIDER.toLowerCase(),
            );
            customOpenIdData = await dataMapper.mapCustomData(
              tokenset.access_token,
              process.env.OPENID_CUSTOM_DATA,
            );
            if (tokenBasedRoles.length) {
              customOpenIdData.roles = tokenBasedRoles;
            } else {
              logger.warn('[openidStrategy] tokenBasedRoles is missing or invalid.');
            }
          }

          // Create or update the user.
          if (!user) {
            user = await createUser(
              {
                provider: 'openid',
                openidId: userinfo.sub,
                username,
                email: userinfo.email || '',
                emailVerified: userinfo.email_verified || false,
                name: fullName,
                role: assignedRole,
                customOpenIdData,
              },
              true,
              true,
            );
          } else {
            user = {
              ...user,
              provider: 'openid',
              openidId: userinfo.sub,
              username,
              name: fullName,
              role: assignedRole,
              customOpenIdData,
            };
          }

          // Update the user's avatar if available.
          user = await updateUserAvatar(user, userinfo.picture, tokenset.access_token);

          // Persist updated user data.
          user = await updateUser(user._id, user);

          logger.info(
            `[openidStrategy] Login success for openidId: ${user.openidId} | email: ${user.email} | username: ${user.username}`,
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
          logger.error('[openidStrategy] Login failed', err);
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
