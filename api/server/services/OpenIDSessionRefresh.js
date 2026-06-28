const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const openIdClient = require('openid-client');
const { logger, DEFAULT_REFRESH_TOKEN_EXPIRY } = require('@librechat/data-schemas');
const {
  isEnabled,
  math,
  createAuthIdentityContext,
  createOpenIDRefreshIdentityTuple,
  createRefreshTokenBridgeIdentity,
  serializeAuthIdentityTuple,
  buildOpenIDRefreshParams,
  setRefreshTokenCookie,
  setOpenIDMarkerCookies,
} = require('@librechat/api');
const { getOpenIdConfig } = require('~/strategies/openidStrategy');
const { storeRefreshTokenBridge } = require('./RefreshTokenBridge');
const {
  acquireOpenIDRefreshFlight,
  completeOpenIDRefreshFlight,
  createOpenIDRefreshFlightKey,
  failOpenIDRefreshFlight,
  waitForOpenIDRefreshFlight,
} = require('./OpenIDRefreshFlight');

/**
 * Shape of `req.session.openidTokens`. Established by `setOpenIDAuthTokens`
 * (`api/server/services/AuthService.js`) on login/refresh, mutated in place by
 * this module on inline refresh, and consumed by `refreshController` and
 * `LogoutController`. Distinct from the snake_case `OIDCTokens` type in
 * `@librechat/data-schemas` (which describes `IUser.federatedTokens` /
 * `IUser.openidTokens` — model fields, not the express-session field).
 *
 * Express-session's SessionData is open by design, so this contract lives in
 * comments rather than a TS interface; keep this and AuthService.js in sync
 * when the shape changes.
 *
 * @typedef {Object} SessionOpenIDTokens
 * @property {string} [accessToken]            — IdP access token (may be opaque).
 * @property {string} [idToken]                — IdP ID token (always JWT).
 * @property {string} [refreshToken]           — IdP refresh token.
 * @property {string} [browserRefreshToken]    — refresh token last known to be written to
 *                                               the browser cookie.
 * @property {number} [expiresAt]              — SESSION cookie expiry (ms).
 * @property {number} [lastRefreshedAt]        — wall-clock ms of the last server-side rotation.
 * @property {number} [accessTokenExpiresAt]   — access token expiry (unix seconds), captured
 *                                               from the IdP `tokenset.expires_in` so opaque
 *                                               access tokens can still be reused without
 *                                               redundant refreshes.
 */

/**
 * Skew buffer for the upstream access-token expiry check. Mirrors
 * `OPENID_REUSE_EXPIRY_BUFFER_SECONDS` in `AuthController.js` so that a token
 * which the controller is about to rotate also triggers an inline refresh here.
 */
const UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS = 30;
const INTERNAL_BROWSER_REFRESH_TOKEN_FIELD = '__browserRefreshToken';
const IDENTITY_PART_SEPARATOR = '\x1f';

/**
 * In-flight upstream refreshes keyed by `getSingleFlightKey(req, user, identityContext)` —
 * a composite of `tenantId:openidIssuer:subject:sessionId:refreshTokenHash`.
 * See that helper for the rationale on why each component is needed; in short,
 * per-session keying prevents refresh-token rotation from breaking sibling
 * sessions, tenant+issuer keying prevents cross-tenant token crossover when
 * distinct users share an IdP `sub`, and refresh-token keying prevents a request
 * carrying a newly-rotated session token from joining an older pending refresh.
 *
 * A fan-out of tool calls landing on an expired session within the SAME
 * session coalesces into one IdP refresh-token grant. Mirrors the
 * single-flight pattern in `OboTokenService.js`.
 *
 * Process-local: multi-worker deployments may double-refresh on the very
 * first concurrent miss across workers — acceptable because the IdP accepts
 * both and the session store uses last-write-wins.
 */
const inFlightRefreshes = new Map();

/**
 * Returns the single-flight key for a refresh attempt, composed from the
 * Express session id, the user's tenant (if any), the IdP issuer + sub, and
 * the current session refresh token.
 * Tightening past `openidId` alone serves two purposes:
 *
 *  1. Same human, multiple sessions: refresh-token rotation by the IdP would
 *     otherwise let session A's refresh invalidate session B's stored
 *     refresh_token, leaving B silently broken. Per-session keying ensures
 *     each session refreshes its own credentials.
 *  2. Multi-tenant deployments where two distinct users share an IdP `sub`
 *     (different issuers, same sub): tenant + issuer disambiguates them so
 *     tokens never cross tenant boundaries via shared in-flight Promises.
 *
 * Concurrent tool calls inside the SAME session with the SAME refresh token
 * still coalesce — the common case the single-flight is designed for (a fan-out
 * of MCP tool calls in one agent run) is unaffected.
 *
 * Returns null when there's no usable identity at all; callers fall through
 * to a non-coalesced refresh, which is safe but missing the optimization.
 */
function getSingleFlightKey(req, user, identityContext) {
  const identitySource = identityContext
    ? {
        id: identityContext.appUserId,
        openidId: identityContext.openidSubject,
        tenantId: identityContext.tenantId,
        openidIssuer: identityContext.openidIssuer,
      }
    : user;
  const tuple = createOpenIDRefreshIdentityTuple({
    user: identitySource,
    requestUser: req?.user,
  });
  const refreshToken = req?.session?.openidTokens?.refreshToken;
  if (!tuple || !refreshToken) {
    return null;
  }
  const sessionId = req?.sessionID || 'no-session';
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  return [serializeAuthIdentityTuple(tuple), sessionId, refreshTokenHash].join(
    IDENTITY_PART_SEPARATOR,
  );
}

/**
 * Returns a short SHA-256 prefix of the single-flight key for use in logs.
 * Preserves correlation across "started" / "joined" / "completed" log events
 * for the same refresh attempt without leaking the underlying values:
 *
 *   - sessionId is effectively a credential (cookie material) and must never
 *     reach log sinks in clear text.
 *   - openidId (the IdP `sub`) and openidIssuer are tenant/user fingerprints.
 *
 * 12 hex chars = 48 bits of entropy: ~7×10^14 distinct keys before a 50%
 * collision chance — more than enough for correlating concurrent refreshes.
 */
function hashKeyForLogs(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
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
 * Returns the access token's expiry in unix seconds, preferring the JWT `exp`
 * claim and falling back to the persisted `accessTokenExpiresAt` written from
 * the IdP's `tokenset.expires_in` on the previous refresh.
 *
 * The fallback exists because some IdPs (Microsoft Entra for Graph audiences,
 * Auth0 without a custom audience) issue OPAQUE access tokens whose expiry
 * cannot be decoded locally. Without this lookup, every OBO call would treat
 * the session as expired and burn an IdP refresh, risking refresh-token
 * rotation thrash under concurrent tool calls.
 *
 * @param {{ accessToken?: string, accessTokenExpiresAt?: number }} sessionTokens
 * @returns {number | null} unix seconds, or null when no source proves an expiry
 */
function getAccessTokenExp(sessionTokens) {
  const fromJwt = decodeJwtExp(sessionTokens?.accessToken);
  if (fromJwt != null) {
    return fromJwt;
  }
  const persisted = sessionTokens?.accessTokenExpiresAt;
  return typeof persisted === 'number' ? persisted : null;
}

function canWriteRefreshTokenCookie(res) {
  return !!res && typeof res.cookie === 'function' && !res.headersSent;
}

/**
 * Returns true when the session token nominated by `tokenPreference` is still
 * valid for at least the skew buffer. Required argument (no default) so every
 * caller is explicit about which token's freshness gates this check.
 *
 * Use 'access_token' for OBO and any flow whose downstream sends the access
 * token to the IdP as an assertion (jwt-bearer / on-behalf-of) — those flows
 * fail when the access token is expired even if the id_token is still fresh.
 * Access-token expiry is read via `getAccessTokenExp`, which handles opaque
 * (non-JWT) tokens by falling back to the persisted `accessTokenExpiresAt`.
 *
 * Use 'id_token' for flows whose downstream is the LibreChat backend itself
 * (e.g. session-token reuse in `refreshController`); the id_token is the
 * standard JWT signed for the client_id audience and is the bearer the SPA
 * sends back to LibreChat.
 *
 * @param {{ accessToken?: string, idToken?: string, accessTokenExpiresAt?: number }} sessionTokens
 * @param {'access_token' | 'id_token'} tokenPreference
 */
function isLiveSessionTokenStillValid(sessionTokens, tokenPreference) {
  if (tokenPreference !== 'access_token' && tokenPreference !== 'id_token') {
    throw new Error(
      `[OpenIDSessionRefresh] tokenPreference must be 'access_token' or 'id_token', got: ${tokenPreference}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const exp =
    tokenPreference === 'access_token'
      ? getAccessTokenExp(sessionTokens)
      : decodeJwtExp(sessionTokens?.idToken);
  return exp != null && exp > now + UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS;
}

/**
 * Builds the OIDCTokens shape consumed by `resolveOboToken`. Required
 * `tokenPreference` selects which token's expiry becomes `expires_at` —
 * caller intent must match what the downstream consumer actually validates.
 * `expiresAtOverride` (unix seconds) wins when the caller has an authoritative
 * value such as the IdP's `tokenset.expires_in` from a fresh refresh response;
 * use it after refresh so we never attribute a prior token's `exp` to a freshly
 * rotated counterpart. For 'access_token', the fallback uses `getAccessTokenExp`
 * so opaque tokens are handled correctly via the persisted `accessTokenExpiresAt`.
 *
 * @param {{ accessToken?: string, idToken?: string, refreshToken?: string, accessTokenExpiresAt?: number }} sessionTokens
 * @param {'access_token' | 'id_token'} tokenPreference
 * @param {number} [expiresAtOverride] — unix seconds (preferred when present)
 */
function buildOIDCTokensFromSession(sessionTokens, tokenPreference, expiresAtOverride) {
  if (tokenPreference !== 'access_token' && tokenPreference !== 'id_token') {
    throw new Error(
      `[OpenIDSessionRefresh] tokenPreference must be 'access_token' or 'id_token', got: ${tokenPreference}`,
    );
  }
  let expiresAt = expiresAtOverride;
  if (expiresAt == null) {
    expiresAt =
      tokenPreference === 'access_token'
        ? (getAccessTokenExp(sessionTokens) ?? undefined)
        : (decodeJwtExp(sessionTokens?.idToken) ?? undefined);
  }
  return {
    access_token: sessionTokens?.accessToken,
    id_token: sessionTokens?.idToken,
    refresh_token: sessionTokens?.refreshToken,
    expires_at: expiresAt ?? undefined,
  };
}

function attachBrowserRefreshTokenMarker(tokens, browserRefreshToken) {
  if (!tokens || !browserRefreshToken) {
    return tokens;
  }
  Object.defineProperty(tokens, INTERNAL_BROWSER_REFRESH_TOKEN_FIELD, {
    value: browserRefreshToken,
    enumerable: false,
    configurable: true,
  });
  return tokens;
}

function getBrowserRefreshTokenMarker(tokens) {
  const browserRefreshToken = tokens?.[INTERNAL_BROWSER_REFRESH_TOKEN_FIELD];
  return typeof browserRefreshToken === 'string' && browserRefreshToken
    ? browserRefreshToken
    : null;
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

/**
 * Writes the rotated refresh token and OpenID marker cookies to the browser so
 * they stay in sync with the session copy. These cookies outlive the shorter
 * express-session cookie and are the fallback `refreshController` reads when
 * the session is gone; without this sync an OBO-triggered rotation would leave
 * stale or mismatched cookies and sign the user out on the next refresh.
 *
 * When no cookie-capable response is available, or `res.headersSent` is true
 * (streaming SSE path), the cookie cannot be set. In this case, store a
 * server-side recovery bridge so that if the session is later lost,
 * `refreshController` can look up the rotated token by hash of the stale cookie
 * token.
 *
 * @param {object} args
 * @param {import('express').Response} [args.res]
 * @param {string} args.newRefreshToken — the rotated token to sync
 * @param {string} [args.oldRefreshToken] — the browser-cookie token to bridge from
 * @param {string} [args.userId] — user._id (required for bridge verification)
 * @param {string} [args.tenantId] — user.tenantId (optional, verified on bridge lookup)
 * @param {string} [args.openidIssuer] — user.openidIssuer (optional, verified on bridge lookup)
 */
async function syncRefreshTokenCookie({
  res,
  newRefreshToken,
  oldRefreshToken,
  userId,
  tenantId,
  openidIssuer,
}) {
  if (canWriteRefreshTokenCookie(res)) {
    const expiryInMilliseconds = math(
      process.env.REFRESH_TOKEN_EXPIRY,
      DEFAULT_REFRESH_TOKEN_EXPIRY,
    );
    const expirationDate = new Date(Date.now() + expiryInMilliseconds);
    setRefreshTokenCookie(res, newRefreshToken, expirationDate);
    setOpenIDMarkerCookies(res, {
      userId,
      expires: expirationDate,
      refreshExpiryMs: expiryInMilliseconds,
    });
    return;
  }

  if (oldRefreshToken && userId) {
    try {
      await storeRefreshTokenBridge({
        oldRefreshToken,
        newRefreshToken,
        userId,
        tenantId,
        openidIssuer,
      });
      logger.debug('[OpenIDSessionRefresh] Stored refresh-token recovery bridge', {
        userId,
        responseAvailable: !!res,
        headersSent: !!res?.headersSent,
        hasCookieWriter: typeof res?.cookie === 'function',
      });
    } catch (error) {
      logger.error('[OpenIDSessionRefresh] Failed to store refresh-token recovery bridge', error);
    }
  } else {
    logger.warn(
      '[OpenIDSessionRefresh] Cannot set refresh-token cookie and insufficient context to store bridge',
      {
        responseAvailable: !!res,
        headersSent: !!res?.headersSent,
        hasCookieWriter: typeof res?.cookie === 'function',
        hasOldToken: !!oldRefreshToken,
        hasUserId: !!userId,
      },
    );
  }
}

async function performIdpRefreshGrant(req, res, user, tokenPreference, identityContext) {
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
  const browserRefreshToken = sessionTokens.browserRefreshToken || refreshToken;
  const needsRefreshTokenSync = nextRefreshToken !== browserRefreshToken;
  const willWriteRefreshTokenCookie = needsRefreshTokenSync && canWriteRefreshTokenCookie(res);

  /**
   * Capture the freshly-issued access-token's expiry (unix seconds) so the
   * next OBO call can reuse it without a redundant refresh — critical for
   * opaque (non-JWT) access tokens whose expiry isn't readable from the
   * token itself. Source order:
   *   1. tokenset.expires_in — IdP's authoritative value for the new access
   *      token. Always preferred when present.
   *   2. decodeJwtExp(tokenset.access_token) — only when access_token is
   *      itself a JWT. Decoding is a fact about THIS token, not a guess.
   *
   * Deliberately do NOT fall back to id_token's exp: id_token TTL is governed
   * by IdP session policy and is often longer than access-token TTL. Trusting
   * it would mark an opaque access token reusable past its real lifetime, so
   * a stale token would be sent to the OBO IdP and rejected. When neither
   * source proves an expiry, leave `accessTokenExpiresAt` unset; the next
   * freshness check will correctly fall through to refresh.
   */
  let nextAccessTokenExp = null;
  if (typeof tokenset.expires_in === 'number') {
    nextAccessTokenExp = Math.floor(Date.now() / 1000) + tokenset.expires_in;
  } else {
    nextAccessTokenExp = decodeJwtExp(tokenset.access_token);
  }

  const updatedSessionTokens = {
    ...sessionTokens,
    accessToken: tokenset.access_token,
    idToken: nextIdToken,
    refreshToken: nextRefreshToken,
    browserRefreshToken: willWriteRefreshTokenCookie ? nextRefreshToken : browserRefreshToken,
    lastRefreshedAt: Date.now(),
  };
  if (nextAccessTokenExp != null) {
    updatedSessionTokens.accessTokenExpiresAt = nextAccessTokenExp;
  } else {
    /** Drop a stale value rather than carry it across an unknown-expiry rotation. */
    delete updatedSessionTokens.accessTokenExpiresAt;
  }

  req.session.openidTokens = updatedSessionTokens;

  /**
   * Keep the browser refresh-token cookie in sync with the session token. If headers are
   * already sent (SSE streaming), store a recovery bridge instead. Do this before the
   * session save so a transient session-store failure cannot lose an IdP-rotated token.
   */
  if (needsRefreshTokenSync) {
    const bridgeIdentity = createRefreshTokenBridgeIdentity({
      user,
      requestUser: req?.user,
      userId: identityContext?.appUserId,
      tenantId: identityContext?.tenantId,
      openidIssuer: identityContext?.openidIssuer,
    });

    await syncRefreshTokenCookie({
      res,
      newRefreshToken: nextRefreshToken,
      oldRefreshToken: browserRefreshToken,
      userId: bridgeIdentity?.userId,
      tenantId: bridgeIdentity?.tenantId,
      openidIssuer: bridgeIdentity?.openidIssuer,
    });
  }

  await persistSession(req);

  logger.info('[OpenIDSessionRefresh] Inline refresh succeeded');
  /**
   * Pass the same expiry as the explicit `expiresAtOverride` so the returned
   * OIDCTokens carries it directly, regardless of token preference. After
   * refresh the IdP's value is authoritative and supersedes any decode.
   */
  return attachBrowserRefreshTokenMarker(
    buildOIDCTokensFromSession(
      updatedSessionTokens,
      tokenPreference,
      nextAccessTokenExp ?? undefined,
    ),
    updatedSessionTokens.browserRefreshToken,
  );
}

async function performIdpRefresh(req, res, user, tokenPreference, identityContext) {
  const refreshToken = req?.session?.openidTokens?.refreshToken;
  const key = createOpenIDRefreshFlightKey({ req, user, refreshToken, identityContext });
  if (!key) {
    return performIdpRefreshGrant(req, res, user, tokenPreference, identityContext);
  }

  let flight;
  try {
    flight = await acquireOpenIDRefreshFlight({ key });
  } catch (error) {
    logger.warn(
      '[OpenIDSessionRefresh] Failed to acquire shared refresh flight; refreshing directly',
      error,
    );
    return performIdpRefreshGrant(req, res, user, tokenPreference, identityContext);
  }

  if (!flight.acquired) {
    logger.debug('[OpenIDSessionRefresh] Joining shared refresh flight', {
      key: hashKeyForLogs(key),
    });
    const resolvedTokens = await waitForOpenIDRefreshFlight({ key });
    if (resolvedTokens) {
      await hydrateSessionFromResolvedTokens(req, resolvedTokens);
      return resolvedTokens;
    }

    logger.warn('[OpenIDSessionRefresh] Shared refresh flight unavailable; refreshing directly', {
      key: hashKeyForLogs(key),
    });
    return performIdpRefreshGrant(req, res, user, tokenPreference, identityContext);
  }

  try {
    const resolvedTokens = await performIdpRefreshGrant(
      req,
      res,
      user,
      tokenPreference,
      identityContext,
    );
    try {
      await completeOpenIDRefreshFlight({
        key,
        ownerId: flight.ownerId,
        tokens: resolvedTokens,
      });
    } catch (flightError) {
      logger.warn('[OpenIDSessionRefresh] Failed to complete shared refresh flight', {
        key: hashKeyForLogs(key),
        error: flightError?.message,
      });
    }
    return resolvedTokens;
  } catch (error) {
    try {
      await failOpenIDRefreshFlight({ key, ownerId: flight.ownerId, error });
    } catch (flightError) {
      logger.warn('[OpenIDSessionRefresh] Failed to mark shared refresh flight failed', {
        key: hashKeyForLogs(key),
        error: flightError?.message,
      });
    }
    throw error;
  }
}

/**
 * Hydrates `req.session.openidTokens` from a resolved OIDCTokens result and
 * persists it. Used by joining requests in the single-flight path: the leader
 * mutates only its own `req.session`, so a joiner that shares the session id but
 * carries a distinct `req` (concurrent HTTP requests) would otherwise re-read
 * stale tokens on its next OBO call. This includes stable-refresh-token IdPs,
 * where the refresh token remains unchanged but the access token and expiry
 * were refreshed by the leader.
 * Idempotent when the joiner shares the leader's `req` object.
 */
async function hydrateSessionFromResolvedTokens(req, resolvedTokens) {
  if (!req?.session || !resolvedTokens?.access_token) {
    return;
  }
  const existing = req.session.openidTokens ?? {};
  const accessTokenChanged = existing.accessToken !== resolvedTokens.access_token;
  const idTokenChanged =
    resolvedTokens.id_token != null && existing.idToken !== resolvedTokens.id_token;
  const refreshTokenChanged =
    resolvedTokens.refresh_token != null && existing.refreshToken !== resolvedTokens.refresh_token;
  const resolvedBrowserRefreshToken = getBrowserRefreshTokenMarker(resolvedTokens);
  const browserRefreshTokenChanged =
    resolvedBrowserRefreshToken != null &&
    existing.browserRefreshToken !== resolvedBrowserRefreshToken;
  const hasResolvedExpiry = typeof resolvedTokens.expires_at === 'number';
  const expiresAtChanged = hasResolvedExpiry
    ? existing.accessTokenExpiresAt !== resolvedTokens.expires_at
    : accessTokenChanged && existing.accessTokenExpiresAt !== undefined;

  if (
    !accessTokenChanged &&
    !idTokenChanged &&
    !refreshTokenChanged &&
    !browserRefreshTokenChanged &&
    !expiresAtChanged
  ) {
    return;
  }

  const nextSessionTokens = {
    ...existing,
    accessToken: resolvedTokens.access_token,
    idToken: resolvedTokens.id_token ?? existing.idToken,
    refreshToken: resolvedTokens.refresh_token ?? existing.refreshToken,
    browserRefreshToken: resolvedBrowserRefreshToken ?? existing.browserRefreshToken,
    lastRefreshedAt: Date.now(),
  };
  if (hasResolvedExpiry) {
    nextSessionTokens.accessTokenExpiresAt = resolvedTokens.expires_at;
  } else if (accessTokenChanged) {
    delete nextSessionTokens.accessTokenExpiresAt;
  }
  req.session.openidTokens = nextSessionTokens;
  await persistSession(req);
}

async function refreshOrReuseSession(req, res, user, tokenPreference, identityContext) {
  const sessionTokens = req?.session?.openidTokens;
  if (!sessionTokens) {
    logger.debug('[OpenIDSessionRefresh] No session tokens to refresh from');
    return null;
  }

  if (isLiveSessionTokenStillValid(sessionTokens, tokenPreference)) {
    logger.debug('[OpenIDSessionRefresh] Live session token reused');
    return buildOIDCTokensFromSession(sessionTokens, tokenPreference);
  }

  return performIdpRefresh(req, res, user, tokenPreference, identityContext);
}

/**
 * Single-flighted entry point. Concurrent callers for the same user share one
 * in-flight refresh. The map is cleared in finally so a failed refresh does
 * not pin subsequent retries.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} [res] — when present and writable, the
 *   rotated refresh token is mirrored to the `refreshToken` cookie.
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {'access_token' | 'id_token'} tokenPreference — required; selects
 *   which token's `exp` gates the live-vs-refresh decision and populates the
 *   returned `expires_at`. OBO callers pass 'access_token'.
 */
async function refreshOpenIDSession(req, res, user, tokenPreference, identityContext) {
  const key = getSingleFlightKey(req, user, identityContext);
  if (!key) {
    return refreshOrReuseSession(req, res, user, tokenPreference, identityContext);
  }

  const inFlight = inFlightRefreshes.get(key);
  if (inFlight) {
    logger.debug(`[OpenIDSessionRefresh] Joining in-flight refresh (key=${hashKeyForLogs(key)})`);
    const resolvedTokens = await inFlight;
    /**
     * The leader mutated only its own request's session. Copy the resolved
     * tokens into THIS request's session so a later OBO call on the joiner
     * reads the rotated refresh token instead of replaying the stale one.
     */
    await hydrateSessionFromResolvedTokens(req, resolvedTokens);
    return resolvedTokens;
  }

  const promise = refreshOrReuseSession(req, res, user, tokenPreference, identityContext).finally(
    () => {
      if (inFlightRefreshes.get(key) === promise) {
        inFlightRefreshes.delete(key);
      }
    },
  );
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
 * `tokenPreference` is required and identifies which upstream token's freshness
 * gates the closure. OBO needs 'access_token' because the OBO exchange uses
 * the access token as the jwt-bearer assertion; using id_token preference here
 * would let an expired access token reach the IdP under a still-fresh id_token.
 *
 * Closure contract (matches `UpstreamTokenProvider` in obo.ts):
 *   - resolves to non-null OIDCTokens when fresh tokens are available.
 *   - resolves to null when refresh is not applicable / no session.
 *   - rejects when refresh was attempted and rejected by the IdP. The MCP
 *     layer wraps the rejection as `session_refresh_failed`.
 *
 * @param {object} args
 * @param {import('express').Request} [args.req]
 * @param {import('express').Response} [args.res] — forwarded so a rotated
 *   refresh token can be mirrored to the `refreshToken` cookie when the
 *   response is still writable (no-op on the streaming tool-call path).
 * @param {import('@librechat/data-schemas').IUser} [args.user]
 * @param {import('@librechat/api').AuthIdentityContext} [args.identityContext]
 * @param {'access_token' | 'id_token'} args.tokenPreference
 * @returns {() => Promise<import('@librechat/data-schemas').OIDCTokens | null>}
 */
function createOpenIDSessionTokenProvider({ req, res, user, tokenPreference, identityContext }) {
  if (tokenPreference !== 'access_token' && tokenPreference !== 'id_token') {
    throw new Error(
      `[OpenIDSessionRefresh] createOpenIDSessionTokenProvider requires tokenPreference 'access_token' or 'id_token', got: ${tokenPreference}`,
    );
  }
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
    const resolvedIdentityContext =
      identityContext ??
      createAuthIdentityContext({
        user,
        requestUser: req?.user,
      });
    return refreshOpenIDSession(req, res, user, tokenPreference, resolvedIdentityContext);
  };
}

module.exports = {
  createOpenIDSessionTokenProvider,
  refreshOpenIDSession,
  /** Exposed for tests; not a public API. */
  __internals: {
    UPSTREAM_TOKEN_EXPIRY_BUFFER_SECONDS,
    inFlightRefreshes,
    getSingleFlightKey,
    isLiveSessionTokenStillValid,
    getAccessTokenExp,
  },
};
