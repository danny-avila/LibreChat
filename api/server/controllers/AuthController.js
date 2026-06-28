const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const {
  math,
  isEnabled,
  findOpenIDUser,
  getOpenIdIssuer,
  createAuthIdentityContext,
  isOpenIDSessionIdentityMatch,
  buildOpenIDRefreshParams,
} = require('@librechat/api');
const {
  requestPasswordReset,
  setOpenIDAuthTokens,
  setCloudFrontAuthCookies,
  resetPassword,
  setAuthTokens,
  registerUser,
} = require('~/server/services/AuthService');
const {
  deleteAllUserSessions,
  getUserById,
  findSession,
  updateUser,
  findUser,
} = require('~/models');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { getOpenIdConfig, getOpenIdEmail } = require('~/strategies');
const {
  getRefreshTokenBridge,
  storeRefreshTokenBridge,
} = require('~/server/services/RefreshTokenBridge');

const AUTH_REFRESH_USER_PROJECTION = '-password -__v -totpSecret -backupCodes -federatedTokens';
const OPENID_REUSE_EXPIRY_BUFFER_SECONDS = 30;
/** Short stale-cookie recovery window after bridged refresh succeeds. */
const OPENID_REFRESH_BRIDGE_GRACE_MS = math(process.env.OPENID_REFRESH_BRIDGE_GRACE_MS, 60 * 1000);
/**
 * Max age (ms) LibreChat reuses a cached OpenID session token before forcing an IdP refresh.
 * Env-overridable (accepts an arithmetic expression, e.g. `60 * 60 * 24 * 1000`, like
 * `SESSION_EXPIRY`): deployments whose IdP revokes the previous access token on refresh can
 * widen this to the access-token lifetime so a still-valid token is not rotated/revoked out
 * from under downstream consumers (e.g. MCP servers that introspect the bearer). Defaults to
 * 15 minutes.
 */
const OPENID_REUSE_MAX_SESSION_AGE_MS = math(
  process.env.OPENID_REUSE_MAX_SESSION_AGE_MS,
  15 * 60 * 1000,
);

const registrationController = async (req, res) => {
  try {
    const response = await registerUser(req.body);
    const { status, message } = response;
    res.status(status).send({ message });
  } catch (err) {
    logger.error('[registrationController]', err);
    return res.status(500).json({ message: err.message });
  }
};

const sanitizeUserForAuthResponse = (user) => {
  const source = (typeof user?.toObject === 'function' ? user.toObject() : user) || {};
  const {
    password: _pw,
    __v: _v,
    totpSecret: _ts,
    backupCodes: _bc,
    federatedTokens: _ft,
    ...safeUser
  } = source;
  return safeUser;
};

const getValidOpenIDReuseUserId = (parsedCookies) => {
  const openidUserId = parsedCookies.openid_user_id;
  if (!openidUserId || !process.env.JWT_REFRESH_SECRET) {
    return null;
  }

  try {
    const payload = jwt.verify(openidUserId, process.env.JWT_REFRESH_SECRET);
    return typeof payload === 'object' && payload != null && typeof payload.id === 'string'
      ? payload.id
      : null;
  } catch {
    return null;
  }
};

const isRecentOpenIDSessionRefresh = (openidTokens) => {
  const lastRefreshedAt = Number(openidTokens?.lastRefreshedAt);
  const elapsed = Date.now() - lastRefreshedAt;
  return (
    Number.isFinite(lastRefreshedAt) && elapsed >= 0 && elapsed <= OPENID_REUSE_MAX_SESSION_AGE_MS
  );
};

const isInvalidGrantError = (error) => {
  const values = [
    error?.message,
    error?.error,
    error?.code,
    error?.response?.data?.error,
    error?.response?.data?.error_description,
    error?.body?.error,
    error?.body?.error_description,
  ];

  return values.some(
    (value) => typeof value === 'string' && value.toLowerCase().includes('invalid_grant'),
  );
};

const refreshOpenIDUser = async ({ refreshToken, strategyName }) => {
  const openIdConfig = getOpenIdConfig();
  const refreshParams = buildOpenIDRefreshParams();
  logger.debug('[refreshController] OpenID refresh params', {
    has_scope: Boolean(process.env.OPENID_SCOPE),
    has_refresh_audience: Boolean(process.env.OPENID_REFRESH_AUDIENCE),
  });
  const tokenset = await openIdClient.refreshTokenGrant(openIdConfig, refreshToken, refreshParams);
  logger.debug('[refreshController] OpenID refresh succeeded', {
    has_access_token: Boolean(tokenset.access_token),
    has_id_token: Boolean(tokenset.id_token),
    has_refresh_token: Boolean(tokenset.refresh_token),
    expires_in: tokenset.expires_in,
  });
  const claims = tokenset.claims();
  const openidIssuer = getOpenIdIssuer(claims, openIdConfig);
  const { user, error, migration } = await findOpenIDUser({
    findUser,
    email: getOpenIdEmail(claims),
    openidId: claims.sub,
    openidIssuer,
    idOnTheSource: claims.oid,
    strategyName,
  });

  logger.debug(
    `[refreshController] findOpenIDUser result: user=${user?.email ?? 'null'}, error=${error ?? 'null'}, migration=${migration}, userOpenidId=${user?.openidId ?? 'null'}, claimsSub=${claims.sub}`,
  );

  return { tokenset, claims, openidIssuer, user, error, migration };
};

const getAuthIdentitySource = (user) =>
  typeof user?.toObject === 'function' ? user.toObject() : user;

const sendOpenIDAuthResponse = ({
  tokenset,
  user,
  existingRefreshToken,
  openidSubject,
  openidIssuer,
  req,
  res,
}) => {
  const token = setOpenIDAuthTokens(tokenset, req, res, {
    userId: user._id.toString(),
    existingRefreshToken,
    tenantId: user.tenantId,
    openidSubject: openidSubject ?? user.openidId,
    openidIssuer: openidIssuer ?? user.openidIssuer,
  });

  return res.status(200).send({ token, user: sanitizeUserForAuthResponse(user) });
};

const isReusableOpenIDSessionIdentity = (openidTokens, user) => {
  const identitySource = getAuthIdentitySource(user);
  const expectedIdentity = createAuthIdentityContext({ user: identitySource });
  const matches = isOpenIDSessionIdentityMatch(openidTokens, expectedIdentity);
  if (!matches) {
    logger.warn('[refreshController] OpenID session token identity mismatch; forcing refresh', {
      userId: expectedIdentity.appUserId,
      has_session_user_id: Boolean(openidTokens?.appUserId),
      has_session_subject: Boolean(openidTokens?.openidSubject),
      has_session_issuer: Boolean(openidTokens?.openidIssuer),
    });
  }
  return matches;
};

const getReusableOpenIDSessionToken = (openidTokens) => {
  if (!isRecentOpenIDSessionRefresh(openidTokens)) {
    return null;
  }

  const candidates = [
    { token: openidTokens?.idToken, type: 'id_token' },
    { token: openidTokens?.accessToken, type: 'access_token' },
  ];
  const now = Math.floor(Date.now() / 1000);

  for (const candidate of candidates) {
    if (!candidate.token) {
      continue;
    }
    /** Decode only: tokens are from the trusted server-side session; expiry gates reuse. */
    const decoded = jwt.decode(candidate.token);
    if (
      decoded &&
      typeof decoded === 'object' &&
      decoded.exp > now + OPENID_REUSE_EXPIRY_BUFFER_SECONDS
    ) {
      return candidate;
    }
  }

  return null;
};

const resetPasswordRequestController = async (req, res) => {
  try {
    const resetService = await requestPasswordReset(req);
    if (resetService instanceof Error) {
      return res.status(400).json(resetService);
    } else {
      return res.status(200).json(resetService);
    }
  } catch (e) {
    logger.error('[resetPasswordRequestController]', e);
    return res.status(400).json({ message: e.message });
  }
};

const resetPasswordController = async (req, res) => {
  try {
    const resetPasswordService = await resetPassword(
      req.body.userId,
      req.body.token,
      req.body.password,
    );
    if (resetPasswordService instanceof Error) {
      return res.status(400).json(resetPasswordService);
    } else {
      await deleteAllUserSessions({ userId: req.body.userId });
      return res.status(200).json(resetPasswordService);
    }
  } catch (e) {
    logger.error('[resetPasswordController]', e);
    return res.status(400).json({ message: e.message });
  }
};

const refreshController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const token_provider = parsedCookies.token_provider;

  if (token_provider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    /** For OpenID users, read refresh token from session to avoid large cookie issues */
    const refreshToken = req.session?.openidTokens?.refreshToken || parsedCookies.refreshToken;

    if (!refreshToken) {
      return res.status(200).send('Refresh token not provided');
    }

    try {
      /**
       * Reuse skips an IdP refresh only for recently-refreshed server-side tokens.
       * Stale, missing, or near-expiry tokens fall through to refreshTokenGrant so
       * upstream revocations and cookie/session extension are checked regularly.
       */
      const reusableSessionToken = getReusableOpenIDSessionToken(req.session?.openidTokens);
      const reuseUserId = reusableSessionToken ? getValidOpenIDReuseUserId(parsedCookies) : null;
      if (reuseUserId) {
        const user = await getUserById(reuseUserId, AUTH_REFRESH_USER_PROJECTION);
        if (user && isReusableOpenIDSessionIdentity(req.session?.openidTokens, user)) {
          const cloudFrontCookiesSet = setCloudFrontAuthCookies(req, res, user);
          logger.debug('[refreshController] OpenID session token reused', {
            token_type: reusableSessionToken.type,
            has_id_token: Boolean(req.session?.openidTokens?.idToken),
            has_access_token: Boolean(req.session?.openidTokens?.accessToken),
            cloudfront_cookies_set: cloudFrontCookiesSet,
          });
          return res.status(200).send({
            token: reusableSessionToken.token,
            user: sanitizeUserForAuthResponse(user),
          });
        }
      }

      const { tokenset, claims, openidIssuer, user, error, migration } = await refreshOpenIDUser({
        refreshToken,
        strategyName: 'refreshController',
      });

      if (error || !user) {
        logger.warn(
          `[refreshController] Redirecting to /login: error=${error ?? 'null'}, user=${user ? 'exists' : 'null'}`,
        );
        return res.status(401).redirect('/login');
      }

      // Handle migration: update user with openidId if found by email without openidId
      // Also handle case where user has mismatched openidId (e.g., after database switch)
      if (migration || user.openidId !== claims.sub) {
        const reason = migration ? 'migration' : 'openidId mismatch';
        await updateUser(user._id.toString(), {
          provider: 'openid',
          openidId: claims.sub,
          ...(openidIssuer ? { openidIssuer } : {}),
        });
        logger.info(
          `[refreshController] Updated user ${user.email} openidId (${reason}): ${user.openidId ?? 'null'} -> ${claims.sub}`,
        );
      }

      return sendOpenIDAuthResponse({
        tokenset,
        user,
        existingRefreshToken: refreshToken,
        openidSubject: claims?.sub,
        openidIssuer,
        req,
        res,
      });
    } catch (error) {
      logger.error('[refreshController] OpenID token refresh error', error);

      /**
       * Detect and recover from stale refresh-token cookie after SSE-triggered rotation.
       * If the initial refresh with the cookie fails with invalid_grant, check if a
       * recovery bridge exists. Bridges are stored when an OBO refresh rotates the token
       * but cannot set the browser cookie (headers already sent during SSE streaming).
       */
      if (isInvalidGrantError(error) && refreshToken) {
        // Bridge lookup uses the signed user-id cookie because /refresh is unauthenticated.
        const openidUserId = parsedCookies.openid_user_id;
        if (openidUserId) {
          try {
            const payload = jwt.verify(openidUserId, process.env.JWT_REFRESH_SECRET);
            const userId = typeof payload === 'object' && payload?.id ? payload.id : null;

            if (userId) {
              const bridgeUser = await getUserById(userId, AUTH_REFRESH_USER_PROJECTION);
              if (!bridgeUser) {
                return res.status(403).send('Invalid OpenID refresh token');
              }

              const bridgedRefreshToken = await getRefreshTokenBridge({
                oldRefreshToken: refreshToken,
                userId,
                tenantId: bridgeUser.tenantId,
                openidIssuer: bridgeUser.openidIssuer,
              });

              if (bridgedRefreshToken) {
                logger.info(
                  '[refreshController] Recovered via refresh-token bridge after invalid_grant',
                  {
                    userId,
                  },
                );

                // Retry with the recovered (rotated) refresh token
                try {
                  const {
                    tokenset: retryTokenset,
                    claims: retryClaims,
                    openidIssuer: retryOpenidIssuer,
                    user: retryUser,
                    error: retryError,
                  } = await refreshOpenIDUser({
                    refreshToken: bridgedRefreshToken,
                    strategyName: 'refreshController (bridge recovery)',
                  });

                  if (retryUser && !retryError) {
                    if (retryUser._id.toString() !== userId) {
                      logger.warn(
                        '[refreshController] Bridge recovery resolved a different user; refusing token issuance',
                        {
                          cookieUserId: userId,
                          resolvedUserId: retryUser._id.toString(),
                        },
                      );
                      return res.status(403).send('Invalid OpenID refresh token');
                    }

                    try {
                      /**
                       * Keep the stale-cookie bridge briefly so parallel /refresh requests that
                       * already sent the old cookie can recover too. Re-storing also shrinks the
                       * remaining replay window from REFRESH_TOKEN_EXPIRY (potentially days) to
                       * this short grace TTL while Mongo/expiresAt cleanup removes it.
                       */
                      await storeRefreshTokenBridge({
                        oldRefreshToken: refreshToken,
                        newRefreshToken: retryTokenset.refresh_token || bridgedRefreshToken,
                        userId,
                        tenantId: bridgeUser.tenantId,
                        openidIssuer: bridgeUser.openidIssuer,
                        ttl: OPENID_REFRESH_BRIDGE_GRACE_MS,
                      });
                    } catch (graceError) {
                      logger.warn(
                        '[refreshController] Bridge grace-period storage failed after successful recovery',
                        graceError,
                      );
                    }
                    return sendOpenIDAuthResponse({
                      tokenset: retryTokenset,
                      user: retryUser,
                      existingRefreshToken: bridgedRefreshToken,
                      openidSubject: retryClaims?.sub,
                      openidIssuer: retryOpenidIssuer,
                      req,
                      res,
                    });
                  }
                } catch (retryError) {
                  logger.error('[refreshController] Bridge recovery retry failed', retryError);
                  // Fall through to generic error response
                }
              }
            }
          } catch (verifyError) {
            logger.debug('[refreshController] Could not verify openid_user_id for bridge lookup', {
              error: verifyError.message,
            });
          }
        }
      }

      return res.status(403).send('Invalid OpenID refresh token');
    }
  }

  /** For non-OpenID users, read refresh token from cookies */
  const refreshToken = parsedCookies.refreshToken;
  if (!refreshToken) {
    return res.status(200).send('Refresh token not provided');
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await getUserById(payload.id, AUTH_REFRESH_USER_PROJECTION);
    if (!user) {
      return res.status(401).redirect('/login');
    }

    const userId = payload.id;

    if (process.env.NODE_ENV === 'CI') {
      const token = await setAuthTokens(userId, res, null, req);
      return res.status(200).send({ token, user: sanitizeUserForAuthResponse(user) });
    }

    /** Session with the hashed refresh token */
    const session = await findSession(
      {
        userId: userId,
        refreshToken: refreshToken,
      },
      { lean: false },
    );

    if (session && session.expiration > new Date()) {
      const token = await setAuthTokens(userId, res, session, req);

      res.status(200).send({ token, user: sanitizeUserForAuthResponse(user) });
    } else if (req?.query?.retry) {
      // Retrying from a refresh token request that failed (401)
      res.status(403).send('No session found');
    } else if (payload.exp < Date.now() / 1000) {
      res.status(403).redirect('/login');
    } else {
      res.status(401).send('Refresh token expired or not found for this user');
    }
  } catch (err) {
    logger.error(`[refreshController] Invalid refresh token:`, err);
    res.status(403).send('Invalid refresh token');
  }
};

const graphTokenController = async (req, res) => {
  try {
    // Validate user is authenticated via Entra ID
    if (!req.user.openidId || req.user.provider !== 'openid') {
      return res.status(403).json({
        message: 'Microsoft Graph access requires Entra ID authentication',
      });
    }

    // Check if OpenID token reuse is active (required for on-behalf-of flow)
    if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) {
      return res.status(403).json({
        message: 'SharePoint integration requires OpenID token reuse to be enabled',
      });
    }

    const scopes = req.query.scopes;
    if (!scopes) {
      return res.status(400).json({
        message: 'Graph API scopes are required as query parameter',
      });
    }

    const accessToken = req.user.federatedTokens?.access_token;
    if (!accessToken) {
      return res.status(401).json({
        message: 'No federated access token available for token exchange',
      });
    }

    const tokenResponse = await getGraphApiToken(req.user, accessToken, scopes);

    res.json(tokenResponse);
  } catch (error) {
    logger.error('[graphTokenController] Failed to obtain Graph API token:', error);
    res.status(500).json({
      message: 'Failed to obtain Microsoft Graph token',
    });
  }
};

module.exports = {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
  graphTokenController,
};
