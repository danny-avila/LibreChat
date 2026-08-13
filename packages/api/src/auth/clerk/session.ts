import type { ClerkSessionContext, IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { UserResponse } from '../user';
import type { ClerkLoginCompletion } from './handler';
import type { VerifiedClerkIdentity } from './verify';
import { ClerkRouteError } from './handler';
import { CLERK_CLOCK_SKEW_MS, MAX_CLERK_TOKEN_LIFETIME_MS } from './verify';

export const MAX_CLERK_SESSION_AGE_MS: number = MAX_CLERK_TOKEN_LIFETIME_MS;
export const MAX_CLERK_2FA_CAPABILITY_LIFETIME_MS: number = 5 * 60_000;

const AUTH_COOKIE_NAMES = ['refreshToken', 'token_provider'] as const;
const POST_COMMIT_FAILURE_MESSAGE = '[Clerk session] response failed after headers were committed';

export type ClerkSessionOutcome =
  | 'success'
  | 'two_factor_pending'
  | 'replay'
  | 'rollback'
  | 'post_commit_failure';

export interface ClerkTwoFactorCapability {
  userId: string;
  twoFAPending: true;
  authProvider: 'clerk';
  tenantScope: string;
  clerkSessionId: string;
  clerkTokenId: string;
  clerkUserId: string;
  tokenExpiresAt: Date;
  absoluteExpiresAt: Date;
  capabilityExpiresAt: Date;
}

export interface PersistClerkSessionInput {
  userId: string;
  tenantId?: string;
  clerk: ClerkSessionContext;
  claimExpiresAt: Date;
}

export interface PersistedClerkSession {
  _id: unknown;
  expiration: Date;
}

export interface ConfirmClerkSessionInput {
  sessionId: string;
  tenantId?: string;
}

export interface SetClerkAuthTokensInput {
  userId: string;
  req: Request;
  res: Response;
  session: PersistedClerkSession;
  clerk: ClerkSessionContext;
}

export interface ClerkSessionCompletionDependencies {
  now: () => Date;
  getSessionExpiryMs: () => number;
  toTenantScope: (tenantId?: string) => string;
  generateTwoFactorTempToken: (capability: ClerkTwoFactorCapability) => string | Promise<string>;
  persistClerkSession: (input: PersistClerkSessionInput) => Promise<PersistedClerkSession>;
  confirmClerkSession: (input: ConfirmClerkSessionInput) => Promise<boolean>;
  setAuthTokens: (input: SetClerkAuthTokensInput) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  serializeUser: (user: IUser) => UserResponse;
  beforeResponse: () => Promise<void>;
  recordOutcome: (outcome: ClerkSessionOutcome) => void;
  logPostCommitFailure: (message: string) => void;
}

export interface ExchangeClerkSessionInput {
  req: Request;
  res: Response;
  user: IUser;
  identity: VerifiedClerkIdentity;
  tenantId?: string;
}

export type ExchangeClerkSession = (
  input: ExchangeClerkSessionInput,
) => Promise<ClerkLoginCompletion>;

function requirePositiveDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('Clerk Session expiry must be a positive finite duration');
  }
  return durationMs;
}

export function getClerkAbsoluteExpiresAt(now: Date, configuredExpiryMs: number): Date {
  const durationMs = Math.min(
    requirePositiveDuration(configuredExpiryMs),
    MAX_CLERK_SESSION_AGE_MS,
  );
  return new Date(now.getTime() + durationMs);
}

function getUserId(user: IUser): string {
  const value = user._id ?? user.id;
  const userId = value?.toString().trim();
  if (!userId) {
    throw new ClerkRouteError('CLERK_LOGIN_FAILED', 500);
  }
  return userId;
}

function getCapabilityExpiresAt(now: Date, tokenExpiresAt: Date, absoluteExpiresAt: Date): Date {
  const timestamp = Math.min(
    now.getTime() + MAX_CLERK_2FA_CAPABILITY_LIFETIME_MS,
    tokenExpiresAt.getTime(),
    absoluteExpiresAt.getTime(),
  );
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) {
    throw new ClerkRouteError('CLERK_TOKEN_INVALID', 401);
  }
  return new Date(timestamp);
}

function getSessionId(session: PersistedClerkSession): string {
  const sessionId = session._id?.toString().trim();
  if (!sessionId) {
    throw new ClerkRouteError('CLERK_LOGIN_FAILED', 500);
  }
  return sessionId;
}

function getDataErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function toClerkRouteError(error: unknown): ClerkRouteError {
  if (error instanceof ClerkRouteError) {
    return error;
  }

  const code = getDataErrorCode(error);
  if (code === 'CLERK_TOKEN_REPLAYED') {
    return new ClerkRouteError('CLERK_TOKEN_REPLAYED', 409);
  }
  if (code === 'CLERK_SESSION_REVOKED' || code === 'CLERK_USER_DELETED') {
    return new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
  }
  return new ClerkRouteError('CLERK_LOGIN_FAILED', 500);
}

function clearPendingAuthCookies(res: Response): void {
  for (const cookieName of AUTH_COOKIE_NAMES) {
    res.clearCookie(cookieName);
  }
}

function createClerkContext(
  identity: VerifiedClerkIdentity,
  tenantScope: string,
  absoluteExpiresAt: Date,
): ClerkSessionContext {
  return {
    authProvider: 'clerk',
    tenantScope,
    clerkSessionId: identity.clerkSessionId,
    clerkTokenId: identity.clerkTokenId,
    clerkUserId: identity.clerkId,
    tokenExpiresAt: identity.tokenExpiresAt,
    absoluteExpiresAt,
  };
}

/**
 * Owns the response-adjacent portion of Fixed Contract 7. The injected
 * persistence operation is the single Mongo transaction; this layer keeps
 * 2FA pre-auth write-free and compensates only the exact committed Session
 * until response headers become externally observable.
 */
export function createExchangeClerkSession(
  deps: ClerkSessionCompletionDependencies,
): ExchangeClerkSession {
  return async function exchangeClerkSession(
    input: ExchangeClerkSessionInput,
  ): Promise<ClerkLoginCompletion> {
    const now = deps.now();
    const absoluteExpiresAt = getClerkAbsoluteExpiresAt(now, deps.getSessionExpiryMs());
    const tenantScope = deps.toTenantScope(input.tenantId);
    const clerk = createClerkContext(input.identity, tenantScope, absoluteExpiresAt);
    const userId = getUserId(input.user);

    if (input.user.twoFactorEnabled === true) {
      const capabilityExpiresAt = getCapabilityExpiresAt(
        now,
        input.identity.tokenExpiresAt,
        absoluteExpiresAt,
      );
      const tempToken = await deps.generateTwoFactorTempToken({
        userId,
        twoFAPending: true,
        ...clerk,
        capabilityExpiresAt,
      });
      deps.recordOutcome('two_factor_pending');
      return { twoFAPending: true, tempToken };
    }

    let committedSession: PersistedClerkSession | undefined;
    try {
      committedSession = await deps.persistClerkSession({
        userId,
        tenantId: input.tenantId,
        clerk,
        claimExpiresAt: new Date(input.identity.tokenExpiresAt.getTime() + CLERK_CLOCK_SKEW_MS),
      });
      const sessionId = getSessionId(committedSession);
      const confirmed = await deps.confirmClerkSession({ sessionId, tenantId: input.tenantId });
      if (!confirmed) {
        throw new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
      }

      const token = await deps.setAuthTokens({
        userId,
        req: input.req,
        res: input.res,
        session: committedSession,
        clerk,
      });
      const user = deps.serializeUser(input.user);
      await deps.beforeResponse();
      deps.recordOutcome('success');
      return { token, user };
    } catch (error) {
      const mappedError = toClerkRouteError(error);
      if (!committedSession) {
        if (mappedError.code === 'CLERK_TOKEN_REPLAYED') {
          deps.recordOutcome('replay');
        }
        throw mappedError;
      }

      if (input.res.headersSent) {
        deps.logPostCommitFailure(POST_COMMIT_FAILURE_MESSAGE);
        deps.recordOutcome('post_commit_failure');
        throw mappedError;
      }

      await deps.deleteSession(getSessionId(committedSession));
      clearPendingAuthCookies(input.res);
      deps.recordOutcome('rollback');
      throw mappedError;
    }
  };
}
