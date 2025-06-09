const undici = require('undici');
const fetch = require('node-fetch');
const passport = require('passport');
const client = require('openid-client');
const jwtDecode = require('jsonwebtoken/decode');
const { CacheKeys } = require('librechat-data-provider');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { hashToken, logger } = require('@librechat/data-schemas');
const { Strategy: OpenIDStrategy } = require('openid-client/passport');
const { isEnabled, safeStringify, logHeaders } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models');
const { getBalanceConfig } = require('~/server/services/Config');
const getLogStores = require('~/cache/getLogStores');

/**
 * @typedef {import('openid-client').ClientMetadata} ClientMetadata
 * @typedef {import('openid-client').Configuration} Configuration
 **/

/**
 * @param {string} url
 * @param {client.CustomFetchOptions} options
 */
async function customFetch(url, options) {
  const urlStr = url.toString();
  logger.debug(`[openidStrategy] Request to: ${urlStr}`);
  const debugOpenId = isEnabled(process.env.DEBUG_OPENID_REQUESTS);
  if (debugOpenId) {
    logger.debug(`[openidStrategy] Request method: ${options.method || 'GET'}`);
    logger.debug(`[openidStrategy] Request headers: ${logHeaders(options.headers)}`);
    if (options.body) {
      let bodyForLogging = '';
      if (options.body instanceof URLSearchParams) {
        bodyForLogging = options.body.toString();
      } else if (typeof options.body === 'string') {
        bodyForLogging = options.body;
      } else {
        bodyForLogging = safeStringify(options.body);
      }
      logger.debug(`[openidStrategy] Request body: ${bodyForLogging}`);
    }
  }

  try {
    /** @type {undici.RequestInit} */
    let fetchOptions = options;
    if (process.env.PROXY) {
      logger.info(`[openidStrategy] proxy agent configured: ${process.env.PROXY}`);
      fetchOptions = {
        ...options,
        dispatcher: new HttpsProxyAgent(process.env.PROXY),
      };
    }

    const response = await undici.fetch(url, fetchOptions);

    if (debugOpenId) {
      logger.debug(`[openidStrategy] Response status: ${response.status} ${response.statusText}`);
      logger.debug(`[openidStrategy] Response headers: ${logHeaders(response.headers)}`);
    }

    if (response.status === 200 && response.headers.has('www-authenticate')) {
      const wwwAuth = response.headers.get('www-authenticate');
      logger.warn(`[openidStrategy] Non-standard WWW-Authenticate header found in successful response (200 OK): ${wwwAuth}.
This violates RFC 7235 and may cause issues with strict OAuth clients. Removing header for compatibility.`);

      /** Cloned response without the WWW-Authenticate header */
      const responseBody = await response.arrayBuffer();
      const newHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'www-authenticate') {
          newHeaders.append(key, value);
        }
      }

      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  } catch (error) {
    logger.error(`[openidStrategy] Fetch error: ${error.message}`);
    throw error;
  }
}

/** @typedef {Configuration | null}  */
let openidConfig = null;

//overload currenturl function because of express version 4 buggy req.host doesn't include port
//More info https://github.com/panva/openid-client/pull/713

class CustomOpenIDStrategy extends OpenIDStrategy {
  currentUrl(req) {
    const hostAndProtocol = process.env.DOMAIN_SERVER;
    return new URL(`${hostAndProtocol}${req.originalUrl ?? req.url}`);
  }
  authorizationRequestParams(req, options) {
    const params = super.authorizationRequestParams(req, options);
    if (options?.state && !params.has('state')) {
      params.set('state', options.state);
    }
    return params;
  }
}

/**
 * Exchange the access token for a new access token using the on-behalf-of flow if required.
 * @param {Configuration} config
 * @param {string} accessToken access token to be exchanged if necessary
 * @param {string} sub - The subject identifier of the user. usually found as "sub" in the claims of the token
 * @param {boolean} fromCache - Indicates whether to use cached tokens.
 * @returns {Promise<string>} The new access token if exchanged, otherwise the original access token.
 */
const exchangeAccessTokenIfNeeded = async (config, accessToken, sub, fromCache = false) => {
  const tokensCache = getLogStores(CacheKeys.OPENID_EXCHANGED_TOKENS);
  const onBehalfFlowRequired = isEnabled(process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFRO_REQUIRED);
  if (onBehalfFlowRequired) {
    if (fromCache) {
      const cachedToken = await tokensCache.get(sub);
      if (cachedToken) {
        return cachedToken.access_token;
      }
    }
    const grantResponse = await client.genericGrantRequest(
      config,
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      {
        scope: process.env.OPENID_ON_BEHALF_FLOW_USERINFRO_SCOPE || 'user.read',
        assertion: accessToken,
        requested_token_use: 'on_behalf_of',
      },
    );
    await tokensCache.set(
      sub,
      {
        access_token: grantResponse.access_token,
      },
      grantResponse.expires_in * 1000,
    );
    return grantResponse.access_token;
  }
  return accessToken;
};

/**
 * get user info from openid provider
 * @param {Configuration} config
 * @param {string} accessToken access token
 * @param {string} sub - The subject identifier of the user. usually found as "sub" in the claims of the token
 * @returns {Promise<Object|null>}
 */
const getUserInfo = async (config, accessToken, sub) => {
  try {
    const exchangedAccessToken = await exchangeAccessTokenIfNeeded(config, accessToken, sub);
    return await client.fetchUserInfo(config, exchangedAccessToken, sub);
  } catch (error) {
    logger.warn(`[openidStrategy] getUserInfo: Error fetching user info: ${error}`);
    return null;
  }
};

/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @param {Configuration} config
 * @param {string} accessToken access token
 * @param {string} sub - The subject identifier of the user. usually found as "sub" in the claims of the token
 * @returns {Promise<Buffer | string>} The image buffer or an empty string if the download fails.
 */
const downloadImage = async (url, config, accessToken, sub) => {
  const exchangedAccessToken = await exchangeAccessTokenIfNeeded(config, accessToken, sub, true);
  if (!url) {
    return '';
  }

  try {
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${exchangedAccessToken}`,
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
 * Sets up the OpenID strategy for authentication.
 * This function configures the OpenID client, handles proxy settings,
 * and defines the OpenID strategy for Passport.js.
 *
 * @async
 * @function setupOpenId
 * @returns {Promise<Configuration | null>} A promise that resolves when the OpenID strategy is set up and returns the openid client config object.
 * @throws {Error} If an error occurs during the setup process.
 */
async function setupOpenId() {
  try {
    /** @type {ClientMetadata} */
    const clientMetadata = {
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
    };

    /** @type {Configuration} */
    openidConfig = await client.discovery(
      new URL(process.env.OPENID_ISSUER),
      process.env.OPENID_CLIENT_ID,
      clientMetadata,
      undefined,
      {
        [client.customFetch]: customFetch,
      },
    );

    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
    const usePKCE = isEnabled(process.env.OPENID_USE_PKCE);
    const openidLogin = new CustomOpenIDStrategy(
      {
        config: openidConfig,
        scope: process.env.OPENID_SCOPE,
        callbackURL: process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL,
        usePKCE,
      },
      async (tokenset, done) => {
        try {
          const claims = tokenset.claims();
          let user = await findUser({ openidId: claims.sub });
          logger.info(
            `[openidStrategy] user ${user ? 'found' : 'not found'} with openidId: ${claims.sub}`,
          );

          if (!user) {
            user = await findUser({ email: claims.email });
            logger.info(
              `[openidStrategy] user ${user ? 'found' : 'not found'} with email: ${
                claims.email
              } for openidId: ${claims.sub}`,
            );
          }
          const userinfo = {
            ...claims,
            ...(await getUserInfo(openidConfig, tokenset.access_token, claims.sub)),
          };
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

            const balanceConfig = await getBalanceConfig();

            user = await createUser(user, balanceConfig, true, true);
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = username;
            user.name = fullName;
          }

          if (!!userinfo && userinfo.picture && !user.avatar?.includes('manual=true')) {
            /** @type {string | undefined} */
            const imageUrl = userinfo.picture;

            let fileName;
            if (crypto) {
              fileName = (await hashToken(userinfo.sub)) + '.png';
            } else {
              fileName = userinfo.sub + '.png';
            }

            const imageBuffer = await downloadImage(
              imageUrl,
              openidConfig,
              tokenset.access_token,
              userinfo.sub,
            );
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

          done(null, { ...user, tokenset });
        } catch (err) {
          logger.error('[openidStrategy] login failed', err);
          done(err);
        }
      },
    );
    passport.use('openid', openidLogin);
    return openidConfig;
  } catch (err) {
    logger.error('[openidStrategy]', err);
    return null;
  }
}
/**
 * @function getOpenIdConfig
 * @description Returns the OpenID client instance.
 * @throws {Error} If the OpenID client is not initialized.
 * @returns {Configuration}
 */
function getOpenIdConfig() {
  if (!openidConfig) {
    throw new Error('OpenID client is not initialized. Please call setupOpenId first.');
  }
  return openidConfig;
}

module.exports = {
  setupOpenId,
  getOpenIdConfig,
};
