const { CacheKeys } = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const getLogStores = require('~/cache/getLogStores');

/** PKCE challenge cache TTL: 5 minutes (enough for user to authenticate with IdP) */
const PKCE_CHALLENGE_TTL = 5 * 60 * 1000;
/** Regex pattern for valid PKCE challenges: 64 hex characters (SHA-256 hex digest) */
const PKCE_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;

/** Removes `code_challenge` from a single URL string, preserving other query params. */
const stripChallengeFromUrl = (url) =>
  url.replace(/\?code_challenge=[^&]*&/, '?').replace(/[?&]code_challenge=[^&]*/, '');

/**
 * Strips `code_challenge` from the request query and URL strings.
 *
 * openid-client v6's Passport Strategy uses `currentUrl.searchParams.size === 0`
 * to distinguish an initial authorization request from an OAuth callback.
 * The admin-panel-specific `code_challenge` query parameter would cause the
 * strategy to misclassify the request as a callback and return 401.
 *
 * Applied defensively to all providers to ensure the admin-panel-private
 * `code_challenge` parameter never reaches any Passport strategy.
 * @param {import('express').Request} req
 */
function stripCodeChallenge(req) {
  delete req.query.code_challenge;
  req.originalUrl = stripChallengeFromUrl(req.originalUrl);
  req.url = stripChallengeFromUrl(req.url);
}

/**
 * Stores the admin-panel PKCE challenge in cache, then strips `code_challenge`
 * from the request so it doesn't interfere with the Passport strategy.
 *
 * Must be called before `passport.authenticate()` — the two operations are
 * logically atomic: read the challenge from the query, persist it, then remove
 * the parameter from the request URL.
 * @param {import('express').Request} req
 * @param {string} state - The OAuth state value (cache key).
 * @param {string} provider - Provider name for logging.
 * @returns {Promise<boolean>} True if stored (or no challenge provided); false on cache failure.
 */
async function storeAndStripChallenge(req, state, provider) {
  const { code_challenge: codeChallenge } = req.query;
  if (typeof codeChallenge !== 'string' || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    stripCodeChallenge(req);
    return true;
  }
  try {
    const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
    await cache.set(`pkce:${state}`, codeChallenge, PKCE_CHALLENGE_TTL);
    stripCodeChallenge(req);
    return true;
  } catch (err) {
    logger.error(`[admin/oauth/${provider}] Failed to store PKCE challenge:`, err);
    return false;
  }
}

module.exports = { stripCodeChallenge, storeAndStripChallenge };
