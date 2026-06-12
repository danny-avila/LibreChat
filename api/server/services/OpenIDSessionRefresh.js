const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, buildOpenIDRefreshParams } = require('@librechat/api');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');

/**
 * Skew buffer for the upstream access-token expiry check. Mirrors
 * `OPENID_REUSE_EXPIRY_BUFFER_SECONDS` in `AuthController.js` so that a token
 * which the controller is about to rotate also triggers an inline refresh here.
 */
const UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS = 30;

/**
 * In-flight upstream refreshes keyed by user id (openidId preferred, falling
 * back to local user._id). Mirrors the single-flight pattern in
 * `OboTokenService.js`. A fan-out of tool calls landing on an expired session
 * coalesces into one IdP refresh-token grant. Process-local: multi-worker
 * deployments may double-refresh on the very first concurrent miss across
 * workers — acceptable because the IdP accepts both and the session store
 * uses last-write-wins.
 */
const inFlightRefreshes = new Map();

function getOpenidUserKey(user) {
  return user?.openidId || user?.id || user?._id?.toString?.() || null;
}

function decodeJwtExp(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') {
      return null;
    }
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch (error) {
    logger.debug('[OpenIDSessionRefresh] JWT decode failed (non-fatal)', error?.message);
    return null;
  }
}

/**
 * Returns true when the session's primary upstream token (id_token preferred,
 * access_token fallback) is still valid for at least `buffer` seconds. This
 * matches the candidate-selection used for refreshController reuse so the two
 * paths agree on what counts as "still valid".
 */
function isLiveSessionTokenStillValid(sessionTokens) {
  const now = Math.floor(Date.now() / 1000);
  const candidates = [sessionTokens?.idToken, sessionTokens?.accessToken];
  for (const token of candidates) {
    const exp = decodeJwtExp(token);
    if (exp != null && exp > now + UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the OIDCTokens shape consumed by `resolveOboToken`. `expires_at` is
 * derived from the id_token JWT exp claim (or access_token as fallback) so it
 * matches what `extractOpenIDTokenInfo` would have produced from the user
 * snapshot — keeping `isOpenIDTokenValid`'s comparison meaningful.
 */
function buildOIDCTokensFromSession(sessionTokens) {
  const expFromJwt =
    decodeJwtExp(sessionTokens?.idToken) ?? decodeJwtExp(sessionTokens?.accessToken);
  return {
    access_token: sessionTokens?.accessToken,
    id_token: sessionTokens?.idToken,
    refresh_token: sessionTokens?.refreshToken,
    expires_at: expFromJwt ?? undefined,
  };
}

async function persistSession(req) {
  if (typeof req?.session?.save !== 'function') {
    return;
  }
  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function performIdpRefresh(req) {
  const sessionTokens = req?.session?.openidTokens;
  const refreshToken = sessionTokens?.refreshToken;
  if (!refreshToken) {
    logger.debug(
      '[OpenIDSessionRefresh] Session lacks refresh_token; cannot refresh upstream token',
    );
    return null;
  }

  const config = getOpenIdConfig();
  const refreshParams = buildOpenIDRefreshParams();
  logger.debug('[OpenIDSessionRefresh] Performing inline IdP refresh-token grant');
  const tokenset = await openIdClient.refreshTokenGrant(config, refreshToken, refreshParams);

  if (!tokenset?.access_token) {
    throw new Error('IdP refresh returned no access_token');
  }

  /**
   * Preserve previous values when the IdP omits `id_token` / `refresh_token`
   * on rotation (Auth0 with rotation off, MS personal accounts in some flows).
   * Same fallback behavior as setOpenIDAuthTokens.
   */
  const nextIdToken = tokenset.id_token || sessionTokens.idToken;
  const nextRefreshToken = tokenset.refresh_token || refreshToken;

  const updatedSessionTokens = {
    ...sessionTokens,
    accessToken: tokenset.access_token,
    idToken: nextIdToken,
    refreshToken: nextRefreshToken,
    lastRefreshedAt: Date.now(),
  };

  req.session.openidTokens = updatedSessionTokens;
  await persistSession(req);

  logger.info('[OpenIDSessionRefresh] Inline refresh succeeded');
  return buildOIDCTokensFromSession(updatedSessionTokens);
}

async function refreshOrReuseSession(req) {
  const sessionTokens = req?.session?.openidTokens;
  if (!sessionTokens) {
    logger.debug('[OpenIDSessionRefresh] No session tokens to refresh from');
    return null;
  }

  if (isLiveSessionTokenStillValid(sessionTokens)) {
    logger.debug('[OpenIDSessionRefresh] Live session token reused');
    return buildOIDCTokensFromSession(sessionTokens);
  }

  return performIdpRefresh(req);
}

/**
 * Single-flighted entry point. Concurrent callers for the same user share one
 * in-flight refresh. The map is cleared in finally so a failed refresh does
 * not pin subsequent retries.
 */
async function refreshOpenIDSession(req, user) {
  const key = getOpenidUserKey(user);
  if (!key) {
    return refreshOrReuseSession(req);
  }

  const inFlight = inFlightRefreshes.get(key);
  if (inFlight) {
    logger.debug(`[OpenIDSessionRefresh] Joining in-flight refresh for user: ${key}`);
    return inFlight;
  }

  const promise = refreshOrReuseSession(req).finally(() => {
    if (inFlightRefreshes.get(key) === promise) {
      inFlightRefreshes.delete(key);
    }
  });
  inFlightRefreshes.set(key, promise);
  /** Swallow rejection on the cleanup chain; the original is delivered to the awaiter. */
  promise.catch(() => {});
  return promise;
}

/**
 * Returns true when this user is in scope for OIDC session refresh. Non-OIDC
 * users and deployments without `OPENID_REUSE_TOKENS` never had a populated
 * `req.session.openidTokens` to begin with — the closure is a no-op there.
 */
function isOIDCRefreshApplicable(user) {
  if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return false;
  }
  if (!user) {
    return false;
  }
  return user.provider === 'openid' || Boolean(user.openidId);
}

/**
 * Builds the UpstreamTokenProvider closure forwarded into the MCP layer.
 * The closure closes over `req` so it reads `req.session.openidTokens` at OBO
 * call time (not at request validation), which is what makes the walk-away
 * failure mode recover without a user-visible re-authentication.
 *
 * Closure contract (matches `UpstreamTokenProvider` in obo.ts):
 *   - resolves to non-null OIDCTokens when fresh tokens are available.
 *   - resolves to null when refresh is not applicable / no session.
 *   - rejects when refresh was attempted and rejected by the IdP. The MCP
 *     layer wraps the rejection as `session_refresh_failed`.
 *
 * @param {object} args
 * @param {import('express').Request} [args.req]
 * @param {import('@librechat/data-schemas').IUser} [args.user]
 * @returns {() => Promise<import('@librechat/data-schemas').OIDCTokens | null>}
 */
function createOpenIDSessionTokenProvider({ req, user }) {
  return async function upstreamTokenProvider() {
    if (!isOIDCRefreshApplicable(user)) {
      return null;
    }
    if (!req?.session?.openidTokens) {
      logger.debug(
        '[OpenIDSessionRefresh] No session.openidTokens available on req; closure returning null',
      );
      return null;
    }
    return refreshOpenIDSession(req, user);
  };
}

module.exports = {
  createOpenIDSessionTokenProvider,
  refreshOpenIDSession,
  /** Exposed for tests; not a public API. */
  __internals: {
    UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS,
    inFlightRefreshes,
    isLiveSessionTokenStillValid,
  },
};
