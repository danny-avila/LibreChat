import type { ClerkSessionContext, IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { ClerkLoginCompletion } from './handler';
import type { VerifiedClerkIdentity } from './verify';
import type { UserResponse } from '../user';
import { CLERK_CLOCK_SKEW_MS, MAX_CLERK_TOKEN_LIFETIME_MS } from './verify';
import { ClerkRouteError } from './handler';

export const MAX_CLERK_SESSION_AGE_MS: number = MAX_CLERK_TOKEN_LIFETIME_MS;
export const MAX_CLERK_2FA_CAPABILITY_LIFETIME_MS: number = 5 * 60_000;

const AUTH_COOKIE_NAMES = ['refreshToken', 'token_provider'] as const;
const POST_COMMIT_FAILURE_MESSAGE = '[Clerk session] response failed after headers were committed';

export type ClerkSessionCompletionOutcome =
  | 'success'
  | 'two_factor_pending'
  | 'replay'
  | 'rollback'
  | 'post_commit_failure';

export interface ClerkTwoFactorTempTokenPayload {
  userId: string;
  twoFAPending: true;
  authProvider: 'clerk';
  tenantScope: string;
  clerkSessionId: string;
  clerkTokenId: string;
  clerkUserId: string;
  tokenExpiresAt: string;
  absoluteExpiresAt: string;
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
  signTwoFactorTempToken: (
    payload: ClerkTwoFactorTempTokenPayload,
    expiresInSeconds: number,
  ) => string | Promise<string>;
  persistClerkSession: (input: PersistClerkSessionInput) => Promise<PersistedClerkSession>;
  confirmClerkSession: (input: ConfirmClerkSessionInput) => Promise<boolean>;
  setAuthTokens: (input: SetClerkAuthTokensInput) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  serializeUser: (user: IUser) => UserResponse;
  beforeResponse: () => Promise<void>;
  recordOutcome: (outcome: ClerkSessionCompletionOutcome) => void;
  logPostCommitFailure: (message: string) => void;
}

export interface ExchangeClerkSessionInput {
  req: Request;
  res: Response;
  user: IUser;
  identity: VerifiedClerkIdentity;
  tenantId?: string;
}

export interface FinalizeClerkTwoFactorSessionInput {
  req: Request;
  res: Response;
  user: IUser;
  capability: unknown;
  tenantId?: string;
}

export interface FinalizedClerkSession {
  token: string;
  user: UserResponse;
}

export type ExchangeClerkSession = (
  input: ExchangeClerkSessionInput,
) => Promise<ClerkLoginCompletion>;

export type FinalizeClerkTwoFactorSession = (
  input: FinalizeClerkTwoFactorSessionInput,
) => Promise<FinalizedClerkSession>;

interface IssueClerkSessionInput {
  req: Request;
  res: Response;
  user: IUser;
  userId: string;
  tenantId?: string;
  clerk: ClerkSessionContext;
  claimExpiresAt: Date;
}

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

function getOptionalUserId(user: IUser): string | undefined {
  const value = user._id ?? user.id;
  const userId = value?.toString().trim();
  return userId || undefined;
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

function getCapabilityDurationSeconds(now: Date, capabilityExpiresAt: Date): number {
  const durationSeconds = Math.floor((capabilityExpiresAt.getTime() - now.getTime()) / 1_000);
  if (durationSeconds <= 0) {
    throw new ClerkRouteError('CLERK_TOKEN_INVALID', 401);
  }
  return durationSeconds;
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

function createTwoFactorTempTokenPayload(
  userId: string,
  clerk: ClerkSessionContext,
): ClerkTwoFactorTempTokenPayload {
  return {
    userId,
    twoFAPending: true,
    authProvider: 'clerk',
    tenantScope: clerk.tenantScope,
    clerkSessionId: clerk.clerkSessionId,
    clerkTokenId: clerk.clerkTokenId,
    clerkUserId: clerk.clerkUserId,
    tokenExpiresAt: clerk.tokenExpiresAt.toISOString(),
    absoluteExpiresAt: clerk.absoluteExpiresAt.toISOString(),
  };
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function getDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function getJwtExpiration(value: unknown): Date | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const date = new Date(value * 1_000);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function forbiddenClerkLogin(): never {
  throw new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
}

function parseTwoFactorCapability(
  value: unknown,
  user: IUser,
  tenantScope: string,
  now: Date,
): { userId: string; clerk: ClerkSessionContext; capabilityExpiresAt: Date } {
  if (!isUnknownRecord(value) || 'clerkToken' in value) {
    return forbiddenClerkLogin();
  }

  const userId = getNonBlankString(value.userId);
  const signedTenantScope = getNonBlankString(value.tenantScope);
  const clerkSessionId = getNonBlankString(value.clerkSessionId);
  const clerkTokenId = getNonBlankString(value.clerkTokenId);
  const clerkUserId = getNonBlankString(value.clerkUserId);
  const tokenExpiresAt = getDate(value.tokenExpiresAt);
  const absoluteExpiresAt = getDate(value.absoluteExpiresAt);
  const capabilityExpiresAt = getJwtExpiration(value.exp);
  const currentUserId = getOptionalUserId(user);
  const currentClerkUserId = getNonBlankString(user.clerkId);

  const invalidIdentity =
    value.twoFAPending !== true ||
    value.authProvider !== 'clerk' ||
    user.twoFactorEnabled !== true ||
    !userId ||
    userId !== currentUserId ||
    !clerkUserId ||
    clerkUserId !== currentClerkUserId ||
    !signedTenantScope ||
    signedTenantScope !== tenantScope ||
    !clerkSessionId ||
    !clerkTokenId;
  if (invalidIdentity || !tokenExpiresAt || !absoluteExpiresAt || !capabilityExpiresAt) {
    return forbiddenClerkLogin();
  }

  const nowTimestamp = now.getTime();
  const capabilityTimestamp = capabilityExpiresAt.getTime();
  if (
    tokenExpiresAt.getTime() <= nowTimestamp ||
    absoluteExpiresAt.getTime() <= nowTimestamp ||
    capabilityTimestamp <= nowTimestamp ||
    capabilityTimestamp > tokenExpiresAt.getTime() ||
    capabilityTimestamp > absoluteExpiresAt.getTime()
  ) {
    return forbiddenClerkLogin();
  }

  return {
    userId,
    capabilityExpiresAt,
    clerk: {
      authProvider: 'clerk',
      tenantScope: signedTenantScope,
      clerkSessionId,
      clerkTokenId,
      clerkUserId,
      tokenExpiresAt,
      absoluteExpiresAt,
    },
  };
}

async function issueClerkSession(
  deps: ClerkSessionCompletionDependencies,
  input: IssueClerkSessionInput,
): Promise<FinalizedClerkSession> {
  let committedSession: PersistedClerkSession | undefined;
  try {
    committedSession = await deps.persistClerkSession({
      userId: input.userId,
      tenantId: input.tenantId,
      clerk: input.clerk,
      claimExpiresAt: input.claimExpiresAt,
    });
    const sessionId = getSessionId(committedSession);
    const confirmed = await deps.confirmClerkSession({ sessionId, tenantId: input.tenantId });
    if (!confirmed) {
      throw new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
    }

    const token = await deps.setAuthTokens({
      userId: input.userId,
      req: input.req,
      res: input.res,
      session: committedSession,
      clerk: input.clerk,
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
      const tempToken = await deps.signTwoFactorTempToken(
        createTwoFactorTempTokenPayload(userId, clerk),
        getCapabilityDurationSeconds(now, capabilityExpiresAt),
      );
      deps.recordOutcome('two_factor_pending');
      return { twoFAPending: true, tempToken };
    }

    return issueClerkSession(deps, {
      req: input.req,
      res: input.res,
      user: input.user,
      userId,
      tenantId: input.tenantId,
      clerk,
      claimExpiresAt: new Date(input.identity.tokenExpiresAt.getTime() + CLERK_CLOCK_SKEW_MS),
    });
  };
}

/**
 * Completes the Clerk branch only after the legacy controller has verified the
 * local second factor and decoded the signed pre-auth capability. No ambient
 * Clerk identity or tenant input is trusted here.
 */
export function createFinalizeClerkTwoFactorSession(
  deps: ClerkSessionCompletionDependencies,
): FinalizeClerkTwoFactorSession {
  return async function finalizeClerkTwoFactorSession(
    input: FinalizeClerkTwoFactorSessionInput,
  ): Promise<FinalizedClerkSession> {
    const now = deps.now();
    const tenantScope = deps.toTenantScope(input.tenantId);
    const capability = parseTwoFactorCapability(input.capability, input.user, tenantScope, now);
    const claimExpiresAt = new Date(
      Math.max(
        capability.clerk.tokenExpiresAt.getTime(),
        capability.capabilityExpiresAt.getTime(),
      ) + CLERK_CLOCK_SKEW_MS,
    );

    return issueClerkSession(deps, {
      req: input.req,
      res: input.res,
      user: input.user,
      userId: capability.userId,
      tenantId: input.tenantId,
      clerk: capability.clerk,
      claimExpiresAt,
    });
  };
}
