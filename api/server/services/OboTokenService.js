const client = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const getLogStores = require('~/cache/getLogStores');

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND']);
const OBO_RETRY_DELAY_MS = 300;

/**
 * In-flight OBO exchanges keyed by `${openidId}:${scopes}`.
 *
 * Without coalescing, parallel tool calls that arrive on a cache miss each issue
 * their own jwt-bearer request to the IdP. Under fan-out, Entra intermittently
 * returns errors that look non-retryable, surfacing as "identity provider
 * rejected the OBO token exchange." A user retry then hits the populated cache
 * and succeeds, which matches the observed flakiness. Sharing a single upstream
 * exchange per key removes the thundering herd.
 */
const inFlightExchanges = new Map();

function getErrorStatus(error) {
  return error?.status ?? error?.statusCode ?? error?.response?.status;
}

function getErrorCode(error) {
  return typeof error?.code === 'string' ? error.code.toUpperCase() : undefined;
}

function isRetryableOboExchangeError(error) {
  const status = getErrorStatus(error);
  if (status != null && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const code = getErrorCode(error);
  if (code != null && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  const message = String(error?.message ?? '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('temporarily unavailable') ||
    message.includes('too many requests') ||
    message.includes('service unavailable')
  );
}

function tagOboExchangeError(error, retryable) {
  if (error && typeof error === 'object') {
    error.retryable = retryable;
    error.oboFailureReason = 'exchange_failed';
  }
  return error;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function performOboExchange({ user, accessToken, scopes, config, tokensCache, cacheKey }) {
  const requestGrant = async () =>
    client.genericGrantRequest(config, 'urn:ietf:params:oauth:grant-type:jwt-bearer', {
      scope: scopes,
      assertion: accessToken,
      requested_token_use: 'on_behalf_of',
    });

  let grantResponse;
  try {
    grantResponse = await requestGrant();
  } catch (error) {
    const retryable = isRetryableOboExchangeError(error);
    if (!retryable) {
      throw tagOboExchangeError(error, false);
    }

    logger.warn(
      `[OboTokenService] Transient OBO exchange failure for user: ${user.openidId}, retrying once`,
      error,
    );
    await delay(OBO_RETRY_DELAY_MS);

    try {
      grantResponse = await requestGrant();
    } catch (retryError) {
      throw tagOboExchangeError(retryError, isRetryableOboExchangeError(retryError));
    }
  }

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

/**
 * Exchange a user's access token for a downstream-scoped token via the
 * OAuth 2.0 On-Behalf-Of (jwt-bearer) grant.
 *
 * Concurrent callers for the same `${openidId}:${scopes}` key share a single
 * upstream exchange (see `inFlightExchanges`) so a fan-out of tool calls right
 * after a cache miss does not produce N parallel requests to the IdP.
 *
 * @param {Object} user - User object with OpenID information
 * @param {string} accessToken - Federated access token used as OBO assertion
 * @param {string} scopes - Scopes to request for the downstream service
 * @param {boolean} [fromCache=true] - When true, read from cache and join any
 *   in-flight exchange. When false, bypass both and force a fresh exchange.
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

    const inFlight = inFlightExchanges.get(cacheKey);
    if (inFlight) {
      logger.debug(`[OboTokenService] Joining in-flight OBO exchange for user: ${user.openidId}`);
      return inFlight;
    }
  }

  logger.debug(
    `[OboTokenService] Requesting new OBO token for user: ${user.openidId}, scopes: ${scopes}`,
  );

  const exchangePromise = performOboExchange({
    user,
    accessToken,
    scopes,
    config,
    tokensCache,
    cacheKey,
  });

  if (fromCache) {
    inFlightExchanges.set(cacheKey, exchangePromise);
    exchangePromise
      .finally(() => {
        if (inFlightExchanges.get(cacheKey) === exchangePromise) {
          inFlightExchanges.delete(cacheKey);
        }
      })
      .catch(() => {
        /* The original rejection is delivered to the awaiting caller; this
         * chain exists only to run cleanup, so swallow it here to avoid an
         * unhandled-rejection warning on the cleanup promise. */
      });
  }

  return exchangePromise;
}

module.exports = {
  exchangeOboToken,
};
