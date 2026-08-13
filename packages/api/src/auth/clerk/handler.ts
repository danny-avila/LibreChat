import { getTenantId, ClerkAuthClaimError } from '@librechat/data-schemas';
import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { Request, Response, NextFunction } from 'express';
import type { ClerkIdentityServiceDependencies, ClerkTenantScope } from './service';
import type { ClerkAuthConfig, ClerkAuthConfigEnabled } from './types';
import type { VerifiedClerkIdentity } from './verify';
import type { UserResponse } from '../user';
import { verifyClerkSessionToken, ClerkAuthError } from './verify';
import { resolveAppConfigForUser } from '../../app/resolve';
import { isEmailDomainAllowed } from '../domain';
import { resolveClerkIdentity } from './service';
import { fetchClerkProfile } from './profile';

export const MAX_CLERK_TOKEN_BYTES = 16_384;

/** Broader than `ClerkAuthFailureCode` — covers every route-layer outcome (Fixed Contract 9). */
export type ClerkRouteErrorCode =
  | 'CLERK_REQUEST_INVALID'
  | 'CLERK_TOKEN_INVALID'
  | 'CLERK_LOGIN_FORBIDDEN'
  | 'CLERK_IDENTITY_CONFLICT'
  | 'CLERK_TOKEN_REPLAYED'
  | 'CLERK_UPSTREAM_RATE_LIMITED'
  | 'CLERK_UNAVAILABLE'
  | 'CLERK_LOGIN_FAILED';

export class ClerkRouteError extends Error {
  readonly code: ClerkRouteErrorCode;
  readonly status: number;

  constructor(code: ClerkRouteErrorCode, status: number) {
    super(`Clerk login failed: ${code}`);
    this.name = 'ClerkRouteError';
    this.code = code;
    this.status = status;
  }
}

interface ClerkLookups {
  tenantId?: string;
  userByClerkId: IUser | null;
  userByEmail: IUser | null | undefined;
}

/** Fields `prepareClerkLogin` attaches to `req` for the later policy/commit steps to reuse. */
export interface ClerkLoginRequestState {
  clerkIdentity: VerifiedClerkIdentity;
  clerkLookups: ClerkLookups;
  clerkAppConfig?: AppConfig;
}

type ClerkRequest = Request & { clerkAuth?: ClerkLoginRequestState; user?: IUser };

function toTenantScope(tenantId: string | undefined): ClerkTenantScope {
  return tenantId ? { tenantId } : { tenantId: { $exists: false } };
}

function requireEnabledConfig(config: ClerkAuthConfig): ClerkAuthConfigEnabled {
  if (!config.enabled) {
    throw new ClerkRouteError('CLERK_UNAVAILABLE', 503);
  }
  return config;
}

function mapClerkAuthError(error: ClerkAuthError): ClerkRouteError {
  return new ClerkRouteError(error.code, error.status);
}

/**
 * Maps the data-schema replay/revocation/tombstone errors (Fixed Contract 7,
 * thrown by the B6-owned exchange transaction) to stable route errors: a
 * replay is `409 CLERK_TOKEN_REPLAYED`; a session already revoked or a user
 * already tombstoned/deleted racing the exchange is `403
 * CLERK_LOGIN_FORBIDDEN`; any other/unexpected claim code fails closed at
 * `500 CLERK_LOGIN_FAILED` rather than leaking an internal code.
 */
function mapClerkAuthClaimError(error: ClerkAuthClaimError): ClerkRouteError {
  if (error.code === 'CLERK_TOKEN_REPLAYED') {
    return new ClerkRouteError('CLERK_TOKEN_REPLAYED', 409);
  }
  if (error.code === 'CLERK_SESSION_REVOKED' || error.code === 'CLERK_USER_DELETED') {
    return new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
  }
  return new ClerkRouteError('CLERK_LOGIN_FAILED', 500);
}

export interface PrepareClerkLoginDeps {
  getClerkAuthConfig: () => ClerkAuthConfig;
  findUser: ClerkIdentityServiceDependencies['findUser'];
}

/**
 * Route step 5. Verifies the token, resolves the authoritative profile only
 * on a `clerkId` miss (Fixed Contract 2), loads the tenant-scoped candidate(s),
 * and sets `req.user` to an existing candidate without writing anything.
 */
export function createPrepareClerkLogin(deps: PrepareClerkLoginDeps) {
  return async function prepareClerkLogin(
    req: ClerkRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const config = requireEnabledConfig(deps.getClerkAuthConfig());
      const claims = await verifyClerkSessionToken(req.body.clerkToken, config);

      const tenantId = getTenantId();
      const tenantScope = toTenantScope(tenantId);

      const userByClerkId = await deps.findUser(
        { clerkId: claims.clerkId, ...tenantScope },
        '+clerkDeletedAt',
      );

      if (userByClerkId) {
        req.clerkAuth = {
          clerkIdentity: claims,
          clerkLookups: { tenantId, userByClerkId, userByEmail: undefined },
        };
        req.user = userByClerkId;
        return next();
      }

      const profile = await fetchClerkProfile(claims.clerkId, config);
      const identity: VerifiedClerkIdentity = { ...claims, ...profile };

      const userByEmail = await deps.findUser(
        { email: profile.email, ...tenantScope },
        '+clerkDeletedAt',
      );

      req.clerkAuth = {
        clerkIdentity: identity,
        clerkLookups: { tenantId, userByClerkId: null, userByEmail },
      };
      req.user = userByEmail ?? undefined;
      return next();
    } catch (error) {
      if (error instanceof ClerkAuthError) {
        return next(mapClerkAuthError(error));
      }
      return next(error);
    }
  };
}

export interface EnforceClerkLoginPolicyDeps {
  getAppConfig: (opts: {
    role?: string;
    tenantId?: string;
    baseOnly?: boolean;
  }) => Promise<AppConfig>;
  isSocialRegistrationAllowed: () => boolean;
}

/**
 * Route step 7. Resolved base/tenant domain allow-list and registration
 * policy — identical rules to existing social-login registration. Never
 * writes. `ALLOW_SOCIAL_REGISTRATION=false` blocks only brand-new creation,
 * never an already-bound subject.
 */
export function createEnforceClerkLoginPolicy(deps: EnforceClerkLoginPolicyDeps) {
  return async function enforceClerkLoginPolicy(
    req: ClerkRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const state = req.clerkAuth;
      if (!state) {
        return next(new ClerkRouteError('CLERK_LOGIN_FAILED', 500));
      }

      const { userByClerkId, userByEmail, tenantId } = state.clerkLookups;
      const candidate = userByClerkId ?? userByEmail ?? null;
      const email = candidate?.email ?? state.clerkIdentity.email;

      const baseConfig = await deps.getAppConfig({ baseOnly: true });
      const appConfig = candidate?.tenantId
        ? await resolveAppConfigForUser(deps.getAppConfig, candidate)
        : baseConfig;

      if (!isEmailDomainAllowed(email ?? '', appConfig?.registration?.allowedDomains)) {
        return next(new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403));
      }

      if (!candidate && !deps.isSocialRegistrationAllowed()) {
        return next(new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403));
      }

      state.clerkAppConfig = tenantId ? appConfig : baseConfig;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export type CommitClerkLoginDeps = ClerkIdentityServiceDependencies;

/**
 * Route step 8. The only step that writes User/link state — calls the
 * Behavior 4 identity service and assigns the final `req.user`.
 */
export function createCommitClerkLogin(deps: CommitClerkLoginDeps) {
  return async function commitClerkLogin(
    req: ClerkRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const state = req.clerkAuth;
      if (!state) {
        return next(new ClerkRouteError('CLERK_LOGIN_FAILED', 500));
      }

      const { userByClerkId, userByEmail, tenantId } = state.clerkLookups;
      const result = await resolveClerkIdentity(
        {
          identity: state.clerkIdentity,
          tenantId,
          userByClerkId,
          userByEmail,
          appConfig: state.clerkAppConfig as AppConfig,
        },
        deps,
      );

      switch (result.status) {
        case 'authenticated':
        case 'already_linked':
        case 'linked':
        case 'created':
          req.user = result.user;
          return next();
        case 'conflict':
          return next(new ClerkRouteError('CLERK_IDENTITY_CONFLICT', 409));
        case 'forbidden':
          return next(new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403));
        case 'not_found':
          return next(new ClerkRouteError('CLERK_LOGIN_FAILED', 500));
      }
    } catch (error) {
      return next(error);
    }
  };
}

/** The exact JSON body `completeClerkLogin` writes (matches `TClerkLoginResponse`). */
export type ClerkLoginCompletion =
  | { twoFAPending: true; tempToken: string }
  | { twoFAPending?: false; token: string; user: UserResponse };

export interface CompleteClerkLoginDeps {
  /**
   * Behavior 6's session exchange: the local-2FA-pending branch, or the
   * correlated Session/claim transaction plus `setAuthTokens` cookies, for
   * the final `req.user` `commitClerkLogin` produced. Must set any auth
   * cookies on `res` itself (mirrors `setAuthTokens`'s existing contract —
   * this factory never touches cookies) and return the exact body this
   * step writes. This is a pure injection boundary: no session/2FA/replay
   * logic lives in this file.
   */
  exchangeClerkSession: (input: {
    req: Request;
    res: Response;
    user: IUser;
    identity: VerifiedClerkIdentity;
    tenantId?: string;
  }) => Promise<ClerkLoginCompletion>;
}

/**
 * Route step 10. Delegates entirely to `deps.exchangeClerkSession` and
 * writes its result as the final response body.
 */
export function createCompleteClerkLogin(deps: CompleteClerkLoginDeps) {
  return async function completeClerkLogin(
    req: ClerkRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const state = req.clerkAuth;
      if (!state || !req.user) {
        next(new ClerkRouteError('CLERK_LOGIN_FAILED', 500));
        return;
      }
      const result = await deps.exchangeClerkSession({
        req,
        res,
        user: req.user,
        identity: state.clerkIdentity,
        tenantId: state.clerkLookups.tenantId,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Route step 4. `clerkToken` is the only accepted body property, a bounded
 * non-empty string.
 */
export function validateClerkLoginBody(req: Request, _res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown> | null | undefined;
  const keys = body ? Object.keys(body) : [];
  const clerkToken = body?.clerkToken;

  if (
    keys.length !== 1 ||
    keys[0] !== 'clerkToken' ||
    typeof clerkToken !== 'string' ||
    clerkToken.trim().length === 0 ||
    Buffer.byteLength(clerkToken, 'utf8') > MAX_CLERK_TOKEN_BYTES
  ) {
    next(new ClerkRouteError('CLERK_REQUEST_INVALID', 400));
    return;
  }

  next();
}

/** Final error-handling middleware for the mounted Clerk login route (Fixed Contract 9). */
export function clerkLoginErrorAdapter(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ClerkRouteError) {
    res.status(error.status).json({ code: error.code });
    return;
  }
  if (error instanceof ClerkAuthError) {
    res.status(error.status).json({ code: error.code });
    return;
  }
  if (error instanceof ClerkAuthClaimError) {
    const mapped = mapClerkAuthClaimError(error);
    res.status(mapped.status).json({ code: mapped.code });
    return;
  }
  res.status(500).json({ code: 'CLERK_LOGIN_FAILED' });
}

export interface CreateClerkAuthHandlersDeps {
  getClerkAuthConfig: PrepareClerkLoginDeps['getClerkAuthConfig'];
  findUser: PrepareClerkLoginDeps['findUser'];
  getAppConfig: EnforceClerkLoginPolicyDeps['getAppConfig'];
  isSocialRegistrationAllowed: EnforceClerkLoginPolicyDeps['isSocialRegistrationAllowed'];
  linkClerkIdentity: CommitClerkLoginDeps['linkClerkIdentity'];
  createSocialUser: CommitClerkLoginDeps['createSocialUser'];
  exchangeClerkSession: CompleteClerkLoginDeps['exchangeClerkSession'];
}

export interface ClerkAuthHandlers {
  validateClerkLoginBody: typeof validateClerkLoginBody;
  prepareClerkLogin: ReturnType<typeof createPrepareClerkLogin>;
  enforceClerkLoginPolicy: ReturnType<typeof createEnforceClerkLoginPolicy>;
  commitClerkLogin: ReturnType<typeof createCommitClerkLogin>;
  completeClerkLogin: ReturnType<typeof createCompleteClerkLogin>;
  clerkLoginErrorAdapter: typeof clerkLoginErrorAdapter;
}

/**
 * Single composition point for the `/api/auth/clerk` route: bundles every
 * typed step (5, 7, 8, 10) plus body validation (4) and the error adapter
 * (11) behind one factory so `api/server/routes/auth.js` only has to supply
 * real dependencies and interleave the legacy rate-limiter/ban middleware
 * (steps 2, 3, 6) and `setBalanceConfig` (step 9) around the returned
 * handlers — no route-ordering logic lives outside this file.
 */
export function createClerkAuthHandlers(deps: CreateClerkAuthHandlersDeps): ClerkAuthHandlers {
  return {
    validateClerkLoginBody,
    prepareClerkLogin: createPrepareClerkLogin({
      getClerkAuthConfig: deps.getClerkAuthConfig,
      findUser: deps.findUser,
    }),
    enforceClerkLoginPolicy: createEnforceClerkLoginPolicy({
      getAppConfig: deps.getAppConfig,
      isSocialRegistrationAllowed: deps.isSocialRegistrationAllowed,
    }),
    commitClerkLogin: createCommitClerkLogin({
      findUser: deps.findUser,
      linkClerkIdentity: deps.linkClerkIdentity,
      createSocialUser: deps.createSocialUser,
    }),
    completeClerkLogin: createCompleteClerkLogin({
      exchangeClerkSession: deps.exchangeClerkSession,
    }),
    clerkLoginErrorAdapter,
  };
}
