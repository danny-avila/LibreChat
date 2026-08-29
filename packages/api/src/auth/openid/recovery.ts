import type {
  AuthIdentityContext,
  LeaseAssertion,
  LeaseContext,
  OpenIDClaims,
  OpenIDLogger,
  OpenIDRefreshResolution,
  OpenIDRequest,
  OpenIDResponse,
  OpenIDTokenSet,
  OpenIDUser,
  RefreshFlightAcquireResult,
  RefreshFlightRecord,
  RefreshTokenBridgeDeleteInput,
  RefreshTokenBridgeIdentity,
  RefreshTokenBridgeInput,
  SharedOpenIDRefreshResult,
  TokenPreference,
} from './types';
import {
  createOpenIDRefreshOwnershipError,
  isOpenIDRefreshOwnershipError,
  toOpenIDLogArgument,
} from './errors';

type FindUser = (...args: Array<string | object | undefined>) => Promise<OpenIDUser | null>;

interface FindOpenIDUserArgs {
  findUser: FindUser;
  email: string;
  openidId: string;
  openidIssuer?: string;
  idOnTheSource?: string;
  strategyName: string;
}

interface RefreshOpenIDUserArgs {
  req: OpenIDRequest;
  res?: OpenIDResponse;
  user: OpenIDUser;
  refreshToken: string;
  browserRefreshToken?: string;
  strategyName: string;
  assertLeaseOwned?: LeaseAssertion;
  deferPublication?: boolean;
}

interface BridgeUser extends OpenIDUser {
  _id: string | number | { toString(): string };
}

interface ResolveOpenIDRefreshInput {
  tokenset: OpenIDTokenSet | null;
  strategyName: string;
}

type SeedRefreshSessionInput = Omit<
  RefreshOpenIDUserArgs,
  'strategyName' | 'assertLeaseOwned' | 'deferPublication'
>;

interface RecoverOpenIDRefreshBridgeInput {
  req: OpenIDRequest;
  res: OpenIDResponse;
  refreshToken: string;
  bridgedRefreshToken: string;
  bridgeUser: BridgeUser;
}

interface SendOpenIDAuthResponseInput {
  tokenset: OpenIDTokenSet;
  user: BridgeUser;
  existingRefreshToken?: string;
  openidSubject?: string;
  openidIssuer?: string;
  predecessorIdentity?: RefreshTokenBridgeIdentity;
  rejectedRefreshTokens?: string[];
  req: OpenIDRequest;
  res: OpenIDResponse;
  assertLeaseOwned?: LeaseAssertion;
  commitPublication?: (appAuthToken: string, publishedTokenset: OpenIDTokenSet) => Promise<void>;
  preparePublication?: boolean;
}

export interface OpenIDRefreshRecoveryService {
  recoverOpenIDRefreshBridge: (
    input: RecoverOpenIDRefreshBridgeInput,
  ) => Promise<SharedOpenIDRefreshResult>;
  refreshOpenIDUser: (input: RefreshOpenIDUserArgs) => Promise<OpenIDRefreshResolution>;
  resolveOpenIDRefreshResult: (
    input: ResolveOpenIDRefreshInput,
  ) => Promise<OpenIDRefreshResolution>;
  sendOpenIDAuthResponse: (input: SendOpenIDAuthResponseInput) => Promise<string | undefined>;
  __internals: {
    getTokenClaims: (tokenset: OpenIDTokenSet) => OpenIDClaims;
    seedRefreshSession: (input: SeedRefreshSessionInput) => AuthIdentityContext;
  };
}

export interface OpenIDRefreshRecoveryDeps {
  jwt: { decode: (token: string) => OpenIDClaims | string | null };
  logger: Pick<OpenIDLogger, 'debug' | 'warn'>;
  findOpenIDUser: (args: FindOpenIDUserArgs) => Promise<{
    user?: OpenIDUser | null;
    error?: string | null;
    migration?: boolean;
  }>;
  findUser: FindUser;
  getOpenIdConfig: () => object;
  getOpenIdEmail: (claims: OpenIDClaims) => string;
  getOpenIdIssuer: (claims: OpenIDClaims, config: object) => string | undefined;
  createAuthIdentityContext: (args: {
    user?: OpenIDUser;
    requestUser?: OpenIDUser;
  }) => AuthIdentityContext;
  refreshOpenIDSession: (
    req: OpenIDRequest,
    res: OpenIDResponse | undefined,
    user: OpenIDUser,
    preference: TokenPreference,
    identity: AuthIdentityContext,
    options: {
      forceRefresh: boolean;
      assertLeaseOwned?: LeaseAssertion;
      deferPublication?: boolean;
    },
  ) => Promise<OpenIDTokenSet | null>;
  storeOpenIDSession: (
    userId: string,
    refreshToken: string,
    tenantId?: string,
    previousRefreshToken?: string,
  ) => Promise<void>;
  setOpenIDAuthTokens: (
    tokens: OpenIDTokenSet,
    req: OpenIDRequest,
    res: OpenIDResponse,
    identity: {
      userId: string;
      existingRefreshToken?: string;
      tenantId?: string;
      openidSubject?: string;
      openidIssuer?: string;
    },
  ) => string | undefined;
  getOpenIDAppAuthToken: (tokens: OpenIDTokenSet, sessionIdToken?: string) => string | undefined;
  clearOpenIDAuthTokens: (
    req: OpenIDRequest,
    res: OpenIDResponse,
    userId: string,
    tenantId?: string,
  ) => void;
  deleteOpenIDSession: (refreshToken: string) => Promise<object | null>;
  createRefreshTokenBridgeFlightKey: (args: {
    oldRefreshToken: string;
    userId: string;
    tenantId?: string;
    openidIssuer?: string;
  }) => string | null;
  storeRefreshTokenBridge: (args: RefreshTokenBridgeInput) => Promise<string | null>;
  deleteRefreshTokenBridges: (args: RefreshTokenBridgeDeleteInput) => Promise<object | null>;
  acquireOpenIDRefreshFlight: (args: { key: string }) => Promise<RefreshFlightAcquireResult>;
  completeOpenIDRefreshFlight: (args: {
    key: string;
    ownerId: string;
    tokens: SharedOpenIDRefreshResult;
  }) => Promise<RefreshFlightRecord | null>;
  failOpenIDRefreshFlight: (args: {
    key: string;
    ownerId: string;
    error: Error;
  }) => Promise<RefreshFlightRecord | null>;
  waitForOpenIDRefreshFlight: (args: { key: string }) => Promise<SharedOpenIDRefreshResult | null>;
  withOpenIDRefreshFlightLease: <T>(args: {
    key: string;
    ownerId: string;
    operation: (context: LeaseContext) => Promise<T>;
  }) => Promise<T>;
  bridgeGraceMs: number;
}

export function createOpenIDRefreshRecoveryService(
  deps: OpenIDRefreshRecoveryDeps,
): OpenIDRefreshRecoveryService {
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
    getOpenIDAppAuthToken,
    clearOpenIDAuthTokens,
    deleteOpenIDSession,
    createRefreshTokenBridgeFlightKey,
    storeRefreshTokenBridge,
    deleteRefreshTokenBridges,
    acquireOpenIDRefreshFlight,
    completeOpenIDRefreshFlight,
    failOpenIDRefreshFlight,
    waitForOpenIDRefreshFlight,
    withOpenIDRefreshFlightLease,
    bridgeGraceMs,
  } = deps;

  function getTokenClaims(tokenset: OpenIDTokenSet): OpenIDClaims {
    if (typeof tokenset?.claims === 'function') {
      return tokenset.claims();
    }
    if (tokenset.__identityClaims?.sub) {
      return tokenset.__identityClaims;
    }
    const identityToken = tokenset.id_token ?? tokenset.__identityIdToken;
    const decoded = identityToken ? jwt.decode(identityToken) : null;
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('OpenID refresh returned no usable identity claims');
    }
    return decoded as OpenIDClaims;
  }

  async function resolveOpenIDRefreshResult({
    tokenset,
    strategyName,
  }: ResolveOpenIDRefreshInput): Promise<OpenIDRefreshResolution> {
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

  function seedRefreshSession({
    req,
    user,
    refreshToken,
    browserRefreshToken,
  }: SeedRefreshSessionInput): AuthIdentityContext {
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
    assertLeaseOwned,
    deferPublication = false,
  }: RefreshOpenIDUserArgs): Promise<OpenIDRefreshResolution> {
    const previousSessionTokens = deferPublication ? req.session?.openidTokens : undefined;
    const hadSessionTokens = Boolean(req.session && 'openidTokens' in req.session);
    const identityContext = seedRefreshSession({
      req,
      user,
      refreshToken,
      browserRefreshToken,
    });
    let tokenset: OpenIDTokenSet | null;
    try {
      tokenset = await refreshOpenIDSession(req, res, user, 'id_token', identityContext, {
        forceRefresh: true,
        ...(assertLeaseOwned ? { assertLeaseOwned } : {}),
        ...(deferPublication ? { deferPublication: true } : {}),
      });
    } finally {
      if (deferPublication && req.session) {
        if (hadSessionTokens) {
          req.session.openidTokens = previousSessionTokens;
        } else {
          delete req.session.openidTokens;
        }
      }
    }
    return resolveOpenIDRefreshResult({ tokenset, strategyName });
  }

  async function recoverOpenIDRefreshBridge({
    req,
    res,
    refreshToken,
    bridgedRefreshToken,
    bridgeUser,
  }: RecoverOpenIDRefreshBridgeInput): Promise<SharedOpenIDRefreshResult> {
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
      if (!resolved?.appAuthToken) {
        throw new Error('OpenID refresh bridge coordination is temporarily unavailable');
      }
      const publishedAppAuthToken = await sendOpenIDAuthResponse({
        tokenset: resolved.tokenset,
        user: bridgeUser,
        existingRefreshToken: refreshToken,
        openidSubject: resolved.claims.sub,
        openidIssuer: resolved.openidIssuer,
        predecessorIdentity: {
          userId,
          tenantId: bridgeUser.tenantId,
          openidIssuer: bridgeUser.openidIssuer,
        },
        req,
        res,
        commitPublication: async () => {},
        preparePublication: false,
      });
      if (publishedAppAuthToken !== resolved.appAuthToken) {
        throw new Error('OpenID refresh bridge follower published an inconsistent token');
      }
      return resolved;
    }

    return withOpenIDRefreshFlightLease({
      key,
      ownerId: flight.ownerId,
      operation: async ({ assertLeaseOwned, markLeaseSettled }: LeaseContext) => {
        try {
          const resolved = await refreshOpenIDUser({
            req,
            res,
            user: bridgeUser,
            refreshToken: bridgedRefreshToken,
            browserRefreshToken: refreshToken,
            strategyName: 'refreshController (bridge recovery)',
            assertLeaseOwned,
            deferPublication: true,
          });
          const { tokenset, user, error } = resolved;
          const resolvedUserId = user?._id?.toString();
          if (!user || error || !resolvedUserId || resolvedUserId !== userId) {
            if (resolvedUserId && resolvedUserId !== userId) {
              logger.warn(
                '[refreshController] Bridge recovery resolved a different user; refusing token issuance',
                { cookieUserId: userId, resolvedUserId },
              );
            }
            throw new Error('Invalid OpenID refresh token');
          }

          await assertLeaseOwned();
          let graceBridgeVersion: string | null = null;
          try {
            graceBridgeVersion = await storeRefreshTokenBridge({
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
              toOpenIDLogArgument(graceError),
            );
          }
          if (graceBridgeVersion) {
            try {
              await assertLeaseOwned();
            } catch (ownershipError) {
              /** Ownership must be proven, not merely unreadable; see the note in `session.ts`. */
              if (!isOpenIDRefreshOwnershipError(ownershipError)) {
                logger.warn(
                  '[refreshController] Keeping the grace bridge; lease ownership is undetermined',
                  { userId, error: (ownershipError as Error)?.message },
                );
                throw ownershipError;
              }
              try {
                await deleteRefreshTokenBridges({
                  refreshTokens: [refreshToken],
                  userId,
                  tenantId: bridgeUser.tenantId,
                  version: graceBridgeVersion,
                });
              } catch (cleanupError) {
                logger.warn(
                  '[refreshController] Failed to remove grace bridge after ownership loss',
                  toOpenIDLogArgument(cleanupError),
                );
              }
              throw ownershipError;
            }
          }

          const publication: { result?: SharedOpenIDRefreshResult } = {};
          const sharedResult = {
            tokenset,
            claims: resolved.claims,
            openidIssuer: resolved.openidIssuer,
            expires_at: tokenset.expires_at,
          };
          const appAuthToken = await sendOpenIDAuthResponse({
            tokenset,
            user: bridgeUser,
            existingRefreshToken: refreshToken,
            openidSubject: resolved.claims.sub,
            openidIssuer: resolved.openidIssuer,
            predecessorIdentity: {
              userId,
              tenantId: bridgeUser.tenantId,
              openidIssuer: bridgeUser.openidIssuer,
            },
            req,
            res,
            assertLeaseOwned,
            commitPublication: async (preparedAppAuthToken, publishedTokenset) => {
              const result = {
                ...sharedResult,
                tokenset: publishedTokenset,
                expires_at: publishedTokenset.expires_at,
                appAuthToken: preparedAppAuthToken,
              };
              const completed = await completeOpenIDRefreshFlight({
                key,
                ownerId: flight.ownerId,
                tokens: result,
              });
              if (!completed) {
                throw createOpenIDRefreshOwnershipError(
                  'OpenID refresh bridge coordination ownership was lost',
                );
              }
              publication.result = result;
              markLeaseSettled();
            },
          });
          if (!publication.result || publication.result.appAuthToken !== appAuthToken) {
            throw new Error('OpenID refresh bridge publication did not settle');
          }
          return publication.result;
        } catch (error) {
          try {
            await failOpenIDRefreshFlight({
              key,
              ownerId: flight.ownerId,
              error: error instanceof Error ? error : new Error('OpenID bridge recovery failed'),
            });
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
    predecessorIdentity,
    rejectedRefreshTokens = [],
    req,
    res,
    assertLeaseOwned,
    commitPublication,
    preparePublication = true,
  }: SendOpenIDAuthResponseInput): Promise<string | undefined> {
    const userId = user._id.toString();
    const publicationIdentity = predecessorIdentity ?? {
      userId,
      tenantId: user.tenantId,
      openidIssuer: user.openidIssuer,
    };
    if (!commitPublication && existingRefreshToken) {
      const key = createRefreshTokenBridgeFlightKey({
        oldRefreshToken: existingRefreshToken,
        userId: publicationIdentity.userId,
        tenantId: publicationIdentity.tenantId,
        openidIssuer: publicationIdentity.openidIssuer,
      });
      if (key) {
        const flight = await acquireOpenIDRefreshFlight({ key });
        if (!flight.acquired) {
          const shared = await waitForOpenIDRefreshFlight({ key });
          if (!shared?.appAuthToken) {
            throw new Error('OpenID authentication publication is temporarily unavailable');
          }
          const publishedAppAuthToken = await sendOpenIDAuthResponse({
            tokenset: shared.tokenset,
            user,
            existingRefreshToken,
            openidSubject: shared.claims.sub,
            openidIssuer: shared.openidIssuer,
            predecessorIdentity: publicationIdentity,
            rejectedRefreshTokens,
            req,
            res,
            commitPublication: async () => {},
            preparePublication: false,
          });
          if (publishedAppAuthToken !== shared.appAuthToken) {
            throw new Error('OpenID authentication follower published an inconsistent token');
          }
          return publishedAppAuthToken;
        }
        return withOpenIDRefreshFlightLease({
          key,
          ownerId: flight.ownerId,
          operation: async ({ assertLeaseOwned, markLeaseSettled }) =>
            sendOpenIDAuthResponse({
              tokenset,
              user,
              existingRefreshToken,
              openidSubject,
              openidIssuer,
              predecessorIdentity: publicationIdentity,
              rejectedRefreshTokens,
              req,
              res,
              assertLeaseOwned,
              commitPublication: async (appAuthToken, publishedTokenset) => {
                const completed = await completeOpenIDRefreshFlight({
                  key,
                  ownerId: flight.ownerId,
                  tokens: {
                    tokenset: publishedTokenset,
                    claims: { sub: openidSubject ?? user.openidId ?? userId },
                    openidIssuer: openidIssuer ?? user.openidIssuer,
                    expires_at: publishedTokenset.expires_at,
                    appAuthToken,
                  },
                });
                if (!completed) {
                  throw createOpenIDRefreshOwnershipError(
                    'OpenID authentication publication was revoked before completion',
                  );
                }
                markLeaseSettled();
              },
            }),
        });
      }
    }
    if (typeof req?.session?.reload === 'function') {
      const reload = req.session.reload.bind(req.session);
      await new Promise<void>((resolve, reject) => {
        reload((error?: Error | null) => (error ? reject(error) : resolve()));
      });
    }
    let effectiveTokenset = tokenset;
    let effectiveExistingRefreshToken = existingRefreshToken;
    const currentSessionTokens = req?.session?.openidTokens;
    const proposedRefreshToken = tokenset.refresh_token || existingRefreshToken;
    if (
      currentSessionTokens?.refreshToken &&
      !rejectedRefreshTokens.includes(currentSessionTokens.refreshToken) &&
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
    if (!nextRefreshToken) {
      throw new Error('OpenID refresh returned no refresh token');
    }

    let authTokenset = effectiveTokenset;
    const effectiveExpiresAt = effectiveTokenset.expires_at;
    if (effectiveTokenset.expires_in == null && Number.isFinite(effectiveExpiresAt)) {
      authTokenset = {
        ...effectiveTokenset,
        expires_in: Math.max(0, Math.floor((effectiveExpiresAt as number) - Date.now() / 1000)),
      };
    }
    const preparedAppAuthToken = getOpenIDAppAuthToken(
      authTokenset,
      req.session?.openidTokens?.idToken,
    );
    if (!preparedAppAuthToken) {
      throw new Error('OpenID refresh returned no application authentication token');
    }
    let bridgeVersion: string | null = null;
    const rotated =
      !!effectiveExistingRefreshToken && nextRefreshToken !== effectiveExistingRefreshToken;

    if (preparePublication) {
      if (assertLeaseOwned) {
        await assertLeaseOwned();
      }
      try {
        await storeOpenIDSession(
          userId,
          nextRefreshToken,
          user.tenantId,
          effectiveExistingRefreshToken,
        );
      } catch (error) {
        if (rotated && effectiveExistingRefreshToken) {
          try {
            await storeRefreshTokenBridge({
              oldRefreshToken: effectiveExistingRefreshToken,
              newRefreshToken: nextRefreshToken,
              userId,
              tenantId: publicationIdentity.tenantId,
              openidIssuer: publicationIdentity.openidIssuer,
              ttl: bridgeGraceMs,
            });
          } catch (bridgeError) {
            logger.warn(
              '[refreshController] Failed to preserve a rotated token after durable-session failure',
              toOpenIDLogArgument(bridgeError),
            );
          }
        }
        throw error;
      }

      if (rotated && effectiveExistingRefreshToken) {
        try {
          bridgeVersion = await storeRefreshTokenBridge({
            oldRefreshToken: effectiveExistingRefreshToken,
            newRefreshToken: nextRefreshToken,
            userId,
            tenantId: publicationIdentity.tenantId,
            openidIssuer: publicationIdentity.openidIssuer,
            ttl: bridgeGraceMs,
          });
        } catch (bridgeError) {
          logger.warn(
            '[refreshController] Failed to store the publication recovery bridge',
            toOpenIDLogArgument(bridgeError),
          );
        }
      }
    }

    try {
      if (assertLeaseOwned) {
        await assertLeaseOwned();
      }
      await commitPublication?.(preparedAppAuthToken, authTokenset);
    } catch (error) {
      if (!isOpenIDRefreshOwnershipError(error)) {
        logger.warn(
          '[refreshController] Keeping the prepared successor after an indeterminate publication failure',
          toOpenIDLogArgument(error),
        );
        throw error;
      }
      try {
        await deleteOpenIDSession(nextRefreshToken);
      } catch (cleanupError) {
        logger.warn(
          '[refreshController] Failed to remove prepared session after publication failure',
          toOpenIDLogArgument(cleanupError),
        );
      }
      if (bridgeVersion && effectiveExistingRefreshToken) {
        try {
          await deleteRefreshTokenBridges({
            refreshTokens: [effectiveExistingRefreshToken],
            userId,
            tenantId: publicationIdentity.tenantId,
            version: bridgeVersion,
          });
        } catch (cleanupError) {
          logger.warn(
            '[refreshController] Failed to remove the owned bridge after publication revocation',
            toOpenIDLogArgument(cleanupError),
          );
        }
      }
      clearOpenIDAuthTokens(req, res, userId, user.tenantId);
      throw error;
    }

    const publishedAppAuthToken = setOpenIDAuthTokens(authTokenset, req, res, {
      userId,
      existingRefreshToken: effectiveExistingRefreshToken,
      tenantId: user.tenantId,
      openidSubject: openidSubject ?? user.openidId,
      openidIssuer: openidIssuer ?? user.openidIssuer,
    });
    if (publishedAppAuthToken !== preparedAppAuthToken) {
      throw new Error('OpenID authentication publication returned an inconsistent token');
    }
    return publishedAppAuthToken;
  }

  return {
    recoverOpenIDRefreshBridge,
    refreshOpenIDUser,
    resolveOpenIDRefreshResult,
    sendOpenIDAuthResponse,
    __internals: { getTokenClaims, seedRefreshSession },
  };
}
