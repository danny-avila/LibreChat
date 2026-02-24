const cookies = require('cookie');
const { logger } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Middleware that proactively refreshes customJWTAuth cookies (e.g. ubAuthToken)
 * before agent chat requests begin streaming. This ensures the cookie is updated
 * for both the current request and future requests.
 *
 * Decodes the JWT payload (base64, no verification) to check the `exp` claim.
 * If expired or expiring within BUFFER_SECONDS, fetches a fresh token from
 * the external auth service and updates the cookie + request header.
 */
const BUFFER_SECONDS = 120;

async function refreshCustomJWT(req, res, next) {
  try {
    if (!process.env.UTILITYBAR_GRAPHQL_URL) {
      logger.info('[refreshCustomJWT] UTILITYBAR_GRAPHQL_URL not set, skipping');
      return next();
    }

    const appConfig = await getAppConfig();
    const mcpConfig = appConfig?.mcpConfig;
    if (!mcpConfig) {
      logger.info('[refreshCustomJWT] No mcpConfig found, skipping');
      return next();
    }

    // Find any MCP server with customJWTAuth configured
    let cookieName = null;
    for (const serverConfig of Object.values(mcpConfig)) {
      if (serverConfig?.customJWTAuth) {
        cookieName = serverConfig.customJWTAuth;
        break;
      }
    }

    if (!cookieName || !req.headers.cookie) {
      logger.info(
        `[refreshCustomJWT] No customJWTAuth cookie configured or no cookies in request (cookieName=${cookieName})`,
      );
      return next();
    }

    const parsedCookies = cookies.parse(req.headers.cookie);
    const jwtToken = parsedCookies[cookieName];
    if (!jwtToken) {
      logger.info(`[refreshCustomJWT] Cookie '${cookieName}' not found in request`);
      return next();
    }

    // Decode JWT payload to check expiry (no verification needed)
    const parts = jwtToken.split('.');
    if (parts.length !== 3) {
      logger.info(
        `[refreshCustomJWT] Cookie '${cookieName}' is not a valid JWT (expected 3 parts, got ${parts.length})`,
      );
      return next();
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = payload.exp ? payload.exp - now : null;
    logger.info(
      `[refreshCustomJWT] Token exp=${payload.exp}, now=${now}, remaining=${timeRemaining}s, buffer=${BUFFER_SECONDS}s`,
    );
    if (!payload.exp || timeRemaining >= BUFFER_SECONDS) {
      logger.info(
        `[refreshCustomJWT] Token still valid (${timeRemaining}s remaining), no refresh needed`,
      );
      return next();
    }

    logger.info(
      `[refreshCustomJWT] ${cookieName} expired or expiring in <${BUFFER_SECONDS}s, refreshing...`,
    );

    const { getUserById, generateToken } = require('~/models');
    const { getCustomAuthToken } = require('~/server/services/AuthService');

    const userId = req.user.id || req.user._id;
    logger.info(`[refreshCustomJWT] Looking up user ${userId} to generate session token`);
    const user = await getUserById(userId);
    if (!user) {
      logger.warn(`[refreshCustomJWT] User ${userId} not found, cannot refresh token`);
      return next();
    }

    logger.info('[refreshCustomJWT] Generating session token for custom auth refresh');
    const sessionToken = await generateToken(user);
    logger.info('[refreshCustomJWT] Calling getCustomAuthToken to fetch fresh token');
    const authData = await getCustomAuthToken(sessionToken, process.env.UTILITYBAR_GRAPHQL_URL);
    if (!authData?.token) {
      logger.warn('[refreshCustomJWT] getCustomAuthToken returned no token, refresh failed');
      return next();
    }

    logger.info(`[refreshCustomJWT] Successfully refreshed ${cookieName}`);

    // Set the new cookie on the response
    res.cookie(cookieName, authData.token, {
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    // Update the request cookie header so downstream code (MCP tool creation) picks up the fresh token
    const updatedCookies = { ...parsedCookies, [cookieName]: authData.token };
    req.headers.cookie = Object.entries(updatedCookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    logger.info(`[refreshCustomJWT] Cookie and request header updated for '${cookieName}'`);
  } catch (err) {
    logger.warn('[refreshCustomJWT] Error refreshing custom JWT:', err.message);
  }

  return next();
}

module.exports = refreshCustomJWT;
