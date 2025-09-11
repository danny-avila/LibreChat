const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const { logger } = require('~/config');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const client = require('openid-client');

/**
 * Get Microsoft Graph API token using existing token exchange mechanism
 * @param {Object} user - User object with OpenID information
 * @param {string} accessToken - Current access token from Authorization header
 * @param {string} scopes - Graph API scopes for the token
 * @param {boolean} fromCache - Whether to try getting token from cache first
 * @returns {Promise<Object>} Graph API token response with access_token and expires_in
 */
async function getGraphApiToken(user, accessToken, scopes, fromCache = true) {
  try {
    if (!user.openidId) {
      throw new Error('User must be authenticated via Entra ID to access Microsoft Graph');
    }

    if (!accessToken) {
      throw new Error('Access token is required for token exchange');
    }

    if (!scopes) {
      throw new Error('Graph API scopes are required for token exchange');
    }

    const config = getOpenIdConfig();
    if (!config) {
      throw new Error('OpenID configuration not available');
    }

    const cacheKey = `${user.openidId}:${scopes}`;
    const tokensCache = getLogStores(CacheKeys.OPENID_EXCHANGED_TOKENS);

    if (fromCache) {
      const cachedToken = await tokensCache.get(cacheKey);
      if (cachedToken) {
        logger.debug(`[GraphTokenService] Using cached Graph API token for user: ${user.openidId}`);
        return cachedToken;
      }
    }

    logger.debug(`[GraphTokenService] Requesting new Graph API token for user: ${user.openidId}`);
    logger.debug(`[GraphTokenService] Requested scopes: ${scopes}`);

    const grantResponse = await client.genericGrantRequest(
      config,
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      {
        scope: scopes,
        assertion: accessToken,
        requested_token_use: 'on_behalf_of',
      },
    );

    const tokenResponse = {
      access_token: grantResponse.access_token,
      token_type: 'Bearer',
      expires_in: grantResponse.expires_in || 3600,
      scope: scopes,
    };

    await tokensCache.set(
      cacheKey,
      tokenResponse,
      (grantResponse.expires_in || 3600) * 1000, // Convert to milliseconds
    );

    logger.debug(
      `[GraphTokenService] Successfully obtained and cached Graph API token for user: ${user.openidId}`,
    );
    return tokenResponse;
  } catch (error) {
    logger.error(
      `[GraphTokenService] Failed to acquire Graph API token for user ${user.openidId}:`,
      error,
    );
    throw new Error(`Graph token acquisition failed: ${error.message}`);
  }
}

module.exports = {
  getGraphApiToken,
};
