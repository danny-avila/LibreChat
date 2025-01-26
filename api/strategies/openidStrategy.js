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

/**
 * Attempts to require the Node.js crypto module.
 * Logs an error if crypto support is unavailable.
 */
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
 * Initializes and configures the OpenID Connect strategy for Passport.
 */
async function setupOpenId() {
  try {
    // Configure proxy if specified
    if (process.env.PROXY) {
      const proxyAgent = new HttpsProxyAgent(process.env.PROXY);
      custom.setHttpOptionsDefaults({ agent: proxyAgent });
      logger.info(`[openidStrategy] Proxy agent added: ${process.env.PROXY}`);
    }

    // Discover OpenID issuer
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
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    };

    if (isEnabled(process.env.OPENID_SET_FIRST_SUPPORTED_ALGORITHM)) {
      clientMetadata.id_token_signed_response_alg = issuer.id_token_signing_alg_values_supported?.[0] || 'RS256';
    }

    const client = new issuer.Client(clientMetadata);
    // Enforce required role if configured
    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
    const adminRole = process.env.OPENID_ADMIN_ROLE;
    logger.info('[openidStrategy] OpenID client created.');

    // Define the OpenID Strategy
    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE,
        },
      },
      async (tokenset, userinfo, done) => {
        try {
          logger.info(`[openidStrategy] Verify login openidId: ${userinfo.sub}`);
          logger.debug('[openidStrategy] Verify login tokenset and userinfo', { tokenset, userinfo });

          // Find or create user
          let user = await findUser({ openidId: userinfo.sub }) ||
                await findUser({ email: userinfo.email });

          if (user) {
            logger.info(`[openidStrategy] Found user: ${user.email} for openidId: ${userinfo.sub}`);
          } else {
            logger.info(`[openidStrategy] No existing user found for openidId: ${userinfo.sub} or email: ${userinfo.email}`);
          }

          // Determine full name and username
          const fullName = getFullName(userinfo);
          const username = process.env.OPENID_USERNAME_CLAIM
            ? userinfo[process.env.OPENID_USERNAME_CLAIM]
            : convertToUsername(userinfo.username || userinfo.given_name || userinfo.email);

          if (requiredRole && requiredRoleParameterPath && requiredRoleTokenKind) {
            const token = requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token;
            let decodedToken;
            try {
              decodedToken = jwtDecode(token);
              if (!decodedToken || typeof decodedToken !== 'object') {throw new Error('Invalid decoded token.');}
            } catch (error) {
              logger.error('[openidStrategy] Error decoding token:', error);
              return done(null, false, { message: 'Invalid token.' });
            }

            const roles = requiredRoleParameterPath.split('.').reduce((obj, key) => obj?.[key], decodedToken);
            if (!Array.isArray(roles) || !roles.includes(requiredRole)) {
              logger.warn(`[openidStrategy] User lacks the required role: ${requiredRole}`);
              return done(null, false, { message: `You must have the "${requiredRole}" role to log in.` });
            }
            logger.debug(`[openidStrategy] User has required role: ${requiredRole}`);
          } else {
            logger.info('[openidStrategy] Role enforcement not configured. Skipping role checks.');
          }

          // Initialize custom OpenID data
          let customOpenIdData = new Map();

          // Fetch and map custom OpenID data if configured
          if (process.env.OPENID_CUSTOM_DATA) {
            const dataMapper = OpenIdDataMapper.getMapper(process.env.OPENID_PROVIDER.toLowerCase());
            customOpenIdData = await dataMapper.mapCustomData(tokenset.access_token, process.env.OPENID_CUSTOM_DATA);

            // Integrate roles into custom data if required
            if (requiredRole && requiredRoleParameterPath && requiredRoleTokenKind) {
              const token = requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token;
              let decodedTokenForRoles;
              try {
                decodedTokenForRoles = jwtDecode(token);
              } catch (error) {
                logger.error('[openidStrategy] Error decoding token for custom roles:', error);
              }

              const tokenBasedRoles = decodedTokenForRoles
                ? requiredRoleParameterPath.split('.').reduce((obj, key) => obj?.[key], decodedTokenForRoles)
                : null;

              if (Array.isArray(tokenBasedRoles)) {
                customOpenIdData.set('roles', tokenBasedRoles);
              } else {
                logger.warn('[openidStrategy] tokenBasedRoles is missing or invalid.');
              }
            }
          }

          // Determine user role
          let assignedRole = SystemRoles.USER;
          if (adminRole && requiredRoleParameterPath && requiredRoleTokenKind) {
            try {
              const token = requiredRoleTokenKind === 'access' ? tokenset.access_token : tokenset.id_token;
              const decodedToken = jwtDecode(token);
              const tokenBasedRoles = requiredRoleParameterPath.split('.').reduce((obj, key) => obj?.[key], decodedToken);
              if (Array.isArray(tokenBasedRoles) && tokenBasedRoles.includes(adminRole)) {
                assignedRole = SystemRoles.ADMIN;
              }
            } catch (error) {
              logger.error('[openidStrategy] Error decoding token for admin role:', error);
            }
          }

          logger.debug(`[openidStrategy] Assigned system role: ${assignedRole}`);

          // Create or update the user object
          if (!user) {
            user = {
              provider: 'openid',
              openidId: userinfo.sub,
              username,
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: fullName,
              role: assignedRole,
              customOpenIdData,
            };
            user = await createUser(user, true, true);
            logger.info(`[openidStrategy] Created new user: ${user.email}`);
          } else {
            // Update existing user
            const updateFields = {
              provider: 'openid',
              openidId: userinfo.sub,
              username,
              name: fullName,
              role: assignedRole,
              customOpenIdData,
            };
            user = { ...user, ...updateFields };
            await updateUser(user._id, updateFields);
            logger.info(`[openidStrategy] Updated existing user: ${user.email}`);
          }

          // Handle avatar update
          if (userinfo.picture && !user.avatar?.includes('manual=true')) {
            /** @type {string | undefined} */
            const imageUrl = userinfo.picture;
            const fileName = crypto ? `${await hashToken(userinfo.sub)}.png` : `${userinfo.sub}.png`;

            try {
              const imageBuffer = await downloadImage(imageUrl, tokenset.access_token);
              if (imageBuffer) {
                const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
                const imagePath = await saveBuffer({
                  fileName,
                  userId: user._id.toString(),
                  buffer: imageBuffer,
                });
                user.avatar = imagePath || '';
                logger.debug(`[openidStrategy] Updated user avatar: ${user.avatar}`);
                await updateUser(user._id, { avatar: user.avatar });
              }
            } catch (error) {
              logger.error(`[openidStrategy] Error downloading or saving avatar: ${error}`);
            }
          }

          logger.info(
            `[openidStrategy] Login success | openidId: ${user.openidId} | email: ${user.email} | username: ${user.username}`,
            { user: { openidId: user.openidId, username: user.username, email: user.email, name: user.name } },
          );

          done(null, user);
        } catch (err) {
          logger.error('[openidStrategy] Login failed:', err);
          done(err);
        }
      },
    );

    // Register the OpenID strategy with Passport
    passport.use('openid', openidLogin);
    logger.info('[openidStrategy] OpenID strategy configured successfully.');
  } catch (err) {
    logger.error('[openidStrategy] Setup failed:', err);
  }
}

module.exports = setupOpenId;
