const undici = require('undici');
const { get } = require('lodash');
const fetch = require('node-fetch');
const passport = require('passport');
const client = require('openid-client');
const jwtDecode = require('jsonwebtoken/decode');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { hashToken, logger } = require('@librechat/data-schemas');
const { Strategy: OpenIDStrategy } = require('openid-client/passport');
const { CacheKeys, ErrorTypes, SystemRoles } = require('librechat-data-provider');
const {
  isEnabled,
  logHeaders,
  safeStringify,
  findOpenIDUser,
  getBalanceConfig,
  isEmailDomainAllowed,
} = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
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
        dispatcher: new undici.ProxyAgent(process.env.PROXY),
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

/**
 * Custom OpenID Strategy
 *
 * Note: Originally overrode currentUrl() to work around Express 4's req.host not including port.
 * With Express 5, req.host now includes the port by default, but we continue to use DOMAIN_SERVER
 * for consistency and explicit configuration control.
 * More info: https://github.com/panva/openid-client/pull/713
 */
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

    if (process.env.OPENID_AUDIENCE) {
      params.set('audience', process.env.OPENID_AUDIENCE);
      logger.debug(
        `[openidStrategy] Adding audience to authorization request: ${process.env.OPENID_AUDIENCE}`,
      );
    }

    /** Generate nonce for federated providers that require it */
    const shouldGenerateNonce = isEnabled(process.env.OPENID_GENERATE_NONCE);
    if (shouldGenerateNonce && !params.has('nonce') && this._sessionKey) {
      const crypto = require('crypto');
      const nonce = crypto.randomBytes(16).toString('hex');
      params.set('nonce', nonce);
      logger.debug('[openidStrategy] Generated nonce for federated provider:', nonce);
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
  const onBehalfFlowRequired = isEnabled(process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED);
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
        scope: process.env.OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE || 'user.read',
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
    logger.error('[openidStrategy] getUserInfo: Error fetching user info:', error);
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
 * Process OpenID authentication tokenset and userinfo
 * This is the core logic extracted from the passport strategy callback
 * Can be reused by both the passport strategy and proxy authentication
 *
 * @param {Object} tokenset - The OpenID tokenset containing access_token, id_token, etc.
 * @param {boolean} existingUsersOnly - If true, only existing users will be processed
 * @returns {Promise<Object>} The authenticated user object with tokenset
 */
async function processOpenIDAuth(tokenset, existingUsersOnly = false) {
  const claims = tokenset.claims ? tokenset.claims() : tokenset;
  const userinfo = {
    ...claims,
  };

  if (tokenset.access_token) {
    const providerUserinfo = await getUserInfo(openidConfig, tokenset.access_token, claims.sub);
    Object.assign(userinfo, providerUserinfo);
  }

  const appConfig = await getAppConfig();
  /** Azure AD sometimes doesn't return email, use preferred_username as fallback */
  const email = userinfo.email || userinfo.preferred_username || userinfo.upn;
  if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
    logger.error(
      `[OpenID Strategy] Authentication blocked - email domain not allowed [Email: ${userinfo.email}]`,
    );
    throw new Error('Email domain not allowed');
  }

  const result = await findOpenIDUser({
    findUser,
    email: email,
    openidId: claims.sub || userinfo.sub,
    idOnTheSource: claims.oid || userinfo.oid,
    strategyName: 'openidStrategy',
  });
  let user = result.user;
  const error = result.error;

  if (error) {
    throw new Error(ErrorTypes.AUTH_FAILED);
  }

  const fullName = getFullName(userinfo);

  const requiredRole = process.env.OPENID_REQUIRED_ROLE;
  if (requiredRole) {
    const requiredRoles = requiredRole
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;

    let decodedToken = '';
    if (requiredRoleTokenKind === 'access' && tokenset.access_token) {
      decodedToken = jwtDecode(tokenset.access_token);
    } else if (requiredRoleTokenKind === 'id' && tokenset.id_token) {
      decodedToken = jwtDecode(tokenset.id_token);
    }

    let roles = get(decodedToken, requiredRoleParameterPath);
    if (!roles || (!Array.isArray(roles) && typeof roles !== 'string')) {
      logger.error(
        `[openidStrategy] Key '${requiredRoleParameterPath}' not found in ${requiredRoleTokenKind} token!`,
      );
      const rolesList =
        requiredRoles.length === 1
          ? `"${requiredRoles[0]}"`
          : `one of: ${requiredRoles.map((r) => `"${r}"`).join(', ')}`;
      throw new Error(`You must have ${rolesList} role to log in.`);
    }

    if (!requiredRoles.some((role) => roles.includes(role))) {
      const rolesList =
        requiredRoles.length === 1
          ? `"${requiredRoles[0]}"`
          : `one of: ${requiredRoles.map((r) => `"${r}"`).join(', ')}`;
      throw new Error(`You must have ${rolesList} role to log in.`);
    }
  }

  let username = '';
  if (process.env.OPENID_USERNAME_CLAIM) {
    username = userinfo[process.env.OPENID_USERNAME_CLAIM];
  } else {
    username = convertToUsername(
      userinfo.preferred_username || userinfo.username || userinfo.email,
    );
  }

  if (existingUsersOnly && !user) {
    throw new Error('User does not exist');
  }

  if (!user) {
    user = {
      provider: 'openid',
      openidId: userinfo.sub,
      username,
      email: email || '',
      emailVerified: userinfo.email_verified || false,
      name: fullName,
      idOnTheSource: userinfo.oid,
    };

    const balanceConfig = getBalanceConfig(appConfig);
    user = await createUser(user, balanceConfig, true, true);
  } else {
    user.provider = 'openid';
    user.openidId = userinfo.sub;
    user.username = username;
    user.name = fullName;
    user.idOnTheSource = userinfo.oid;
    if (email && email !== user.email) {
      user.email = email;
      user.emailVerified = userinfo.email_verified || false;
    }
  }

  const adminRole = process.env.OPENID_ADMIN_ROLE;
  const adminRoleParameterPath = process.env.OPENID_ADMIN_ROLE_PARAMETER_PATH;
  const adminRoleTokenKind = process.env.OPENID_ADMIN_ROLE_TOKEN_KIND;

  if (adminRole && adminRoleParameterPath && adminRoleTokenKind) {
    let adminRoleObject;
    switch (adminRoleTokenKind) {
      case 'access':
        adminRoleObject = jwtDecode(tokenset.access_token);
        break;
      case 'id':
        adminRoleObject = jwtDecode(tokenset.id_token);
        break;
      case 'userinfo':
        adminRoleObject = userinfo;
        break;
      default:
        logger.error(
          `[openidStrategy] Invalid admin role token kind: ${adminRoleTokenKind}. Must be one of 'access', 'id', or 'userinfo'.`,
        );
        throw new Error('Invalid admin role token kind');
    }

    const adminRoles = get(adminRoleObject, adminRoleParameterPath);

    if (
      adminRoles &&
      (adminRoles === true ||
        adminRoles === adminRole ||
        (Array.isArray(adminRoles) && adminRoles.includes(adminRole)))
    ) {
      user.role = SystemRoles.ADMIN;
      logger.info(`[openidStrategy] User ${username} is an admin based on role: ${adminRole}`);
    } else if (user.role === SystemRoles.ADMIN) {
      user.role = SystemRoles.USER;
      logger.info(
        `[openidStrategy] User ${username} demoted from admin - role no longer present in token`,
      );
    }
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
      const { saveBuffer } = getStrategyFunctions(
        appConfig?.fileStrategy ?? process.env.CDN_PROVIDER,
      );
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

  return {
    ...user,
    tokenset,
    federatedTokens: {
      access_token: tokenset.access_token,
      refresh_token: tokenset.refresh_token,
      expires_at: tokenset.expires_at,
    },
  };
}

/**
 * @param {boolean | undefined} [existingUsersOnly]
 */
function createOpenIDCallback(existingUsersOnly) {
  return async (tokenset, done) => {
    try {
      const user = await processOpenIDAuth(tokenset, existingUsersOnly);
      done(null, user);
    } catch (err) {
      if (err.message === 'Email domain not allowed') {
        return done(null, false, { message: err.message });
      }
      if (err.message === ErrorTypes.AUTH_FAILED) {
        return done(null, false, { message: err.message });
      }
      if (err.message && err.message.includes('role to log in')) {
        return done(null, false, { message: err.message });
      }
      logger.error('[openidStrategy] login failed', err);
      done(err);
    }
  };
}

/**
 * Sets up the OpenID strategy specifically for admin authentication.
 * @param {Configuration} openidConfig
 */
const setupOpenIdAdmin = (openidConfig) => {
  try {
    if (!openidConfig) {
      throw new Error('OpenID configuration not initialized');
    }

    const openidAdminLogin = new CustomOpenIDStrategy(
      {
        config: openidConfig,
        scope: process.env.OPENID_SCOPE,
        usePKCE: isEnabled(process.env.OPENID_USE_PKCE),
        clockTolerance: process.env.OPENID_CLOCK_TOLERANCE || 300,
        callbackURL: process.env.DOMAIN_SERVER + '/api/admin/oauth/openid/callback',
      },
      createOpenIDCallback(true),
    );

    passport.use('openidAdmin', openidAdminLogin);
  } catch (err) {
    logger.error('[openidStrategy] setupOpenIdAdmin', err);
  }
};

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
    const shouldGenerateNonce = isEnabled(process.env.OPENID_GENERATE_NONCE);

    /** @type {ClientMetadata} */
    const clientMetadata = {
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
    };

    if (shouldGenerateNonce) {
      clientMetadata.response_types = ['code'];
      clientMetadata.grant_types = ['authorization_code'];
      clientMetadata.token_endpoint_auth_method = 'client_secret_post';
    }

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

    logger.info(`[openidStrategy] OpenID authentication configuration`, {
      generateNonce: shouldGenerateNonce,
      reason: shouldGenerateNonce
        ? 'OPENID_GENERATE_NONCE=true - Will generate nonce and use explicit metadata for federated providers'
        : 'OPENID_GENERATE_NONCE=false - Standard flow without explicit nonce or metadata',
    });

    const openidLogin = new CustomOpenIDStrategy(
      {
        config: openidConfig,
        scope: process.env.OPENID_SCOPE,
        callbackURL: process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL,
        clockTolerance: process.env.OPENID_CLOCK_TOLERANCE || 300,
        usePKCE: isEnabled(process.env.OPENID_USE_PKCE),
      },
      createOpenIDCallback(),
    );
    passport.use('openid', openidLogin);
    setupOpenIdAdmin(openidConfig);
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
