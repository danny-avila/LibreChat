/* eslint-disable @typescript-eslint/no-explicit-any -- dependency-injected Express/OpenID boundary */

export interface OpenIDRefreshRecoveryDeps {
  jwt: { decode: (token: string) => unknown };
  logger: {
    debug: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
  findOpenIDUser: (args: Record<string, any>) => Promise<Record<string, any>>;
  findUser: (...args: any[]) => Promise<any>;
  getOpenIdConfig: () => any;
  getOpenIdEmail: (claims: Record<string, any>) => string;
  getOpenIdIssuer: (claims: Record<string, any>, config: any) => string | undefined;
  createAuthIdentityContext: (args: Record<string, any>) => Record<string, any>;
  refreshOpenIDSession: (...args: any[]) => Promise<Record<string, any> | null>;
  storeOpenIDSession: (...args: any[]) => Promise<any>;
  setOpenIDAuthTokens: (...args: any[]) => string | undefined;
  createRefreshTokenBridgeFlightKey: (args: Record<string, any>) => string | null;
  storeRefreshTokenBridge: (args: Record<string, any>) => Promise<any>;
  acquireOpenIDRefreshFlight: (args: Record<string, any>) => Promise<Record<string, any>>;
  completeOpenIDRefreshFlight: (args: Record<string, any>) => Promise<any>;
  failOpenIDRefreshFlight: (args: Record<string, any>) => Promise<any>;
  waitForOpenIDRefreshFlight: (args: Record<string, any>) => Promise<any>;
  withOpenIDRefreshFlightLease: (args: Record<string, any>) => Promise<any>;
  bridgeGraceMs: number;
}

export function createOpenIDRefreshRecoveryService(deps: OpenIDRefreshRecoveryDeps): any {
  const {
    jwt,
    logger,
    findOpenIDUser,
    findUser,
    getOpenIdConfig,
    getOpenIdEmail,
    getOpenIdIssuer,
    createAuthIdentityContext,
    refreshOpenIDSession,
    storeOpenIDSession,
    setOpenIDAuthTokens,
    createRefreshTokenBridgeFlightKey,
    storeRefreshTokenBridge,
    acquireOpenIDRefreshFlight,
    completeOpenIDRefreshFlight,
    failOpenIDRefreshFlight,
    waitForOpenIDRefreshFlight,
    withOpenIDRefreshFlightLease,
    bridgeGraceMs,
  } = deps;

  function getTokenClaims(tokenset: any): Record<string, any> {
    if (typeof tokenset?.claims === 'function') {
      return tokenset.claims();
    }
    const decoded = tokenset?.id_token ? jwt.decode(tokenset.id_token) : null;
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('OpenID refresh returned no usable identity claims');
    }
    return decoded as Record<string, any>;
  }

  async function resolveOpenIDRefreshResult({ tokenset, strategyName }: any) {
    if (!tokenset?.access_token) {
      throw new Error('OpenID refresh returned no access token');
    }
    const claims = getTokenClaims(tokenset);
    const openIdConfig = getOpenIdConfig();
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
  }

  function seedRefreshSession({ req, user, refreshToken, browserRefreshToken }: any) {
    if (!req.session) {
      throw new Error('OpenID refresh requires an Express session');
    }
    const identity = createAuthIdentityContext({ user, requestUser: req.user });
    req.session.openidTokens = {
      ...(req.session.openidTokens ?? {}),
      refreshToken,
      browserRefreshToken: browserRefreshToken || refreshToken,
      appUserId: identity.appUserId,
      openidSubject: identity.openidSubject,
      ...(identity.tenantId ? { tenantId: identity.tenantId } : {}),
      ...(identity.openidIssuer ? { openidIssuer: identity.openidIssuer } : {}),
    };
    return identity;
  }

  async function refreshOpenIDUser({
    req,
    res,
    user,
    refreshToken,
    browserRefreshToken,
    strategyName,
  }: any) {
    const identityContext = seedRefreshSession({
      req,
      user,
      refreshToken,
      browserRefreshToken,
    });
    const tokenset = await refreshOpenIDSession(req, res, user, 'id_token', identityContext, {
      forceRefresh: true,
    });
    return resolveOpenIDRefreshResult({ tokenset, strategyName });
  }

  async function recoverOpenIDRefreshBridge({
    req,
    res,
    refreshToken,
    bridgedRefreshToken,
    bridgeUser,
  }: any) {
    const userId = bridgeUser._id.toString();
    const key = createRefreshTokenBridgeFlightKey({
      oldRefreshToken: refreshToken,
      userId,
      tenantId: bridgeUser.tenantId,
      openidIssuer: bridgeUser.openidIssuer,
    });
    if (!key) {
      throw new Error('OpenID refresh bridge coordination key is unavailable');
    }

    const flight = await acquireOpenIDRefreshFlight({ key });
    if (!flight.acquired) {
      const resolved = await waitForOpenIDRefreshFlight({ key });
      if (!resolved) {
        throw new Error('OpenID refresh bridge coordination is temporarily unavailable');
      }
      return resolved;
    }

    return withOpenIDRefreshFlightLease({
      key,
      ownerId: flight.ownerId,
      operation: async ({ assertLeaseOwned, markLeaseSettled }: any) => {
        try {
          const resolved = await refreshOpenIDUser({
            req,
            res,
            user: bridgeUser,
            refreshToken: bridgedRefreshToken,
            browserRefreshToken: refreshToken,
            strategyName: 'refreshController (bridge recovery)',
          });
          const { tokenset, user, error } = resolved;
          if (!user || error || user._id.toString() !== userId) {
            if (user && user._id.toString() !== userId) {
              logger.warn(
                '[refreshController] Bridge recovery resolved a different user; refusing token issuance',
                { cookieUserId: userId, resolvedUserId: user._id.toString() },
              );
            }
            throw new Error('Invalid OpenID refresh token');
          }

          await assertLeaseOwned();
          try {
            await storeRefreshTokenBridge({
              oldRefreshToken: refreshToken,
              newRefreshToken: tokenset.refresh_token || bridgedRefreshToken,
              userId,
              tenantId: bridgeUser.tenantId,
              openidIssuer: bridgeUser.openidIssuer,
              ttl: bridgeGraceMs,
            });
          } catch (graceError) {
            logger.warn(
              '[refreshController] Bridge grace-period storage failed after successful recovery',
              graceError,
            );
          }

          const sharedResult = {
            tokenset,
            claims: resolved.claims,
            openidIssuer: resolved.openidIssuer,
            expires_at: tokenset.expires_at,
          };
          const completed = await completeOpenIDRefreshFlight({
            key,
            ownerId: flight.ownerId,
            tokens: sharedResult,
          });
          if (!completed) {
            throw new Error('OpenID refresh bridge coordination ownership was lost');
          }
          markLeaseSettled();
          return sharedResult;
        } catch (error) {
          try {
            await failOpenIDRefreshFlight({ key, ownerId: flight.ownerId, error });
          } catch (flightError) {
            logger.warn('[refreshController] Failed to mark refresh bridge flight failed', {
              error: (flightError as Error)?.message,
            });
          }
          throw error;
        }
      },
    });
  }

  async function sendOpenIDAuthResponse({
    tokenset,
    user,
    existingRefreshToken,
    openidSubject,
    openidIssuer,
    req,
    res,
  }: any) {
    const userId = user._id.toString();
    if (typeof req?.session?.reload === 'function') {
      await new Promise<void>((resolve, reject) => {
        req.session.reload((error: any) => (error ? reject(error) : resolve()));
      });
    }
    let effectiveTokenset = tokenset;
    let effectiveExistingRefreshToken = existingRefreshToken;
    const currentSessionTokens = req?.session?.openidTokens;
    const proposedRefreshToken = tokenset.refresh_token || existingRefreshToken;
    if (
      currentSessionTokens?.refreshToken &&
      currentSessionTokens.refreshToken !== existingRefreshToken &&
      currentSessionTokens.refreshToken !== proposedRefreshToken
    ) {
      if (!currentSessionTokens.accessToken) {
        throw new Error('OpenID refresh result was superseded by an incomplete session state');
      }
      logger.debug(
        '[refreshController] Using the advanced session instead of a stale flight result',
      );
      effectiveExistingRefreshToken = currentSessionTokens.refreshToken;
      effectiveTokenset = {
        access_token: currentSessionTokens.accessToken,
        id_token: currentSessionTokens.idToken,
        refresh_token: currentSessionTokens.refreshToken,
        expires_at: currentSessionTokens.accessTokenExpiresAt,
      };
    }
    const nextRefreshToken = effectiveTokenset.refresh_token || effectiveExistingRefreshToken;
    try {
      await storeOpenIDSession(
        userId,
        nextRefreshToken,
        user.tenantId,
        effectiveExistingRefreshToken,
      );
    } catch (error) {
      if (effectiveExistingRefreshToken && nextRefreshToken !== effectiveExistingRefreshToken) {
        try {
          await storeRefreshTokenBridge({
            oldRefreshToken: effectiveExistingRefreshToken,
            newRefreshToken: nextRefreshToken,
            userId,
            tenantId: user.tenantId,
            openidIssuer: openidIssuer ?? user.openidIssuer,
            ttl: bridgeGraceMs,
          });
        } catch (bridgeError) {
          logger.warn(
            '[refreshController] Failed to preserve a rotated token after durable-session failure',
            bridgeError,
          );
        }
      }
      throw error;
    }

    let authTokenset = effectiveTokenset;
    if (effectiveTokenset.expires_in == null && Number.isFinite(effectiveTokenset.expires_at)) {
      authTokenset = {
        ...effectiveTokenset,
        expires_in: Math.max(0, Math.floor(effectiveTokenset.expires_at - Date.now() / 1000)),
      };
    }
    return setOpenIDAuthTokens(authTokenset, req, res, {
      userId,
      existingRefreshToken: effectiveExistingRefreshToken,
      tenantId: user.tenantId,
      openidSubject: openidSubject ?? user.openidId,
      openidIssuer: openidIssuer ?? user.openidIssuer,
    });
  }

  return {
    recoverOpenIDRefreshBridge,
    refreshOpenIDUser,
    resolveOpenIDRefreshResult,
    sendOpenIDAuthResponse,
    __internals: { getTokenClaims, seedRefreshSession },
  };
}
