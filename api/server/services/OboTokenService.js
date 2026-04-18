const client = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const getLogStores = require('~/cache/getLogStores');

/**
 * Exchange a user's access token for a downstream-scoped token via the
 * OAuth 2.0 On-Behalf-Of (jwt-bearer) grant.
 *
 * @param {Object} user - User object with OpenID information
 * @param {string} accessToken - Federated access token used as OBO assertion
 * @param {string} scopes - Scopes to request for the downstream service
 * @param {boolean} [fromCache=true] - Whether to try getting token from cache first
 * @returns {Promise<Object>} Token response with access_token and expires_in
 */
async function exchangeOboToken(user, accessToken, scopes, fromCache = true) {
  if (!user.openidId) {
    throw new Error('User must be authenticated via OpenID to perform OBO token exchange');
  }

  if (!accessToken) {
    throw new Error('Access token is required for OBO exchange');
  }

  if (!scopes) {
    throw new Error('Scopes are required for OBO exchange');
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
      logger.debug(`[OboTokenService] Using cached token for user: ${user.openidId}`);
      return cachedToken;
    }
  }

  logger.debug(
    `[OboTokenService] Requesting new OBO token for user: ${user.openidId}, scopes: ${scopes}`,
  );

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

  await tokensCache.set(cacheKey, tokenResponse, (grantResponse.expires_in || 3600) * 1000);

  logger.debug(
    `[OboTokenService] Successfully obtained and cached OBO token for user: ${user.openidId}`,
  );
  return tokenResponse;
}

module.exports = {
  exchangeOboToken,
};
