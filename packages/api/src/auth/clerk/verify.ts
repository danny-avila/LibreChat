import { verifyToken } from '@clerk/backend';
import type { ClerkAuthConfigEnabled } from './types';
import { recordClerkTokenVerification } from '../../app/metrics';

export const CLERK_CLOCK_SKEW_MS: number = 5_000;
export const MAX_CLERK_TOKEN_LIFETIME_MS: number = 15 * 60 * 1_000;

export type ClerkAuthFailureCode =
  | 'CLERK_TOKEN_INVALID'
  | 'CLERK_LOGIN_FORBIDDEN'
  | 'CLERK_UPSTREAM_RATE_LIMITED'
  | 'CLERK_UNAVAILABLE';

export class ClerkAuthError extends Error {
  readonly code: ClerkAuthFailureCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ClerkAuthFailureCode,
    status: number,
    options: { retryAfterSeconds?: number } = {},
  ) {
    super('Clerk authentication failed');
    this.name = 'ClerkAuthError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export interface VerifiedClerkIdentity {
  clerkId: string;
  clerkSessionId: string;
  clerkTokenId: string;
  authorizedParty: string;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
  email?: string;
  emailVerified?: true;
  name?: string;
  username?: string;
  avatarUrl?: string;
}

function invalidToken(): ClerkAuthError {
  return new ClerkAuthError('CLERK_TOKEN_INVALID', 401);
}

function requireNonBlankString(value: unknown): string {
  if (typeof value !== 'string') {
    throw invalidToken();
  }

  const normalized = value.trim();
  if (!normalized) {
    throw invalidToken();
  }

  return normalized;
}

function requireNumericDate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidToken();
  }

  return value;
}

function normalizeVerifiedClaims(
  claims: { [claim: string]: unknown },
  authorizedParties: readonly string[],
): VerifiedClerkIdentity {
  const clerkId = requireNonBlankString(claims.sub);
  const clerkSessionId = requireNonBlankString(claims.sid);
  const clerkTokenId = requireNonBlankString(claims.jti);
  const authorizedParty = requireNonBlankString(claims.azp);
  requireNonBlankString(claims.iss);

  if (!authorizedParties.includes(authorizedParty)) {
    throw invalidToken();
  }
  if (claims.sts === 'pending') {
    throw invalidToken();
  }

  const issuedAtSeconds = requireNumericDate(claims.iat);
  const expiresAtSeconds = requireNumericDate(claims.exp);
  const lifetimeMs = (expiresAtSeconds - issuedAtSeconds) * 1_000;

  if (lifetimeMs <= 0 || lifetimeMs > MAX_CLERK_TOKEN_LIFETIME_MS) {
    throw invalidToken();
  }

  return {
    clerkId,
    clerkSessionId,
    clerkTokenId,
    authorizedParty,
    tokenIssuedAt: new Date(issuedAtSeconds * 1_000),
    tokenExpiresAt: new Date(expiresAtSeconds * 1_000),
  };
}

function getElapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

export async function verifyClerkSessionToken(
  token: string,
  config: ClerkAuthConfigEnabled,
): Promise<VerifiedClerkIdentity> {
  const startedAt = process.hrtime.bigint();
  let outcome: 'success' | 'invalid' = 'invalid';

  try {
    const claims = await verifyToken(token, {
      jwtKey: config.jwtKey,
      authorizedParties: [...config.authorizedParties],
      clockSkewInMs: CLERK_CLOCK_SKEW_MS,
    });

    const identity = normalizeVerifiedClaims(claims, config.authorizedParties);
    outcome = 'success';
    return identity;
  } catch {
    throw invalidToken();
  } finally {
    recordClerkTokenVerification(outcome, getElapsedSeconds(startedAt));
  }
}
