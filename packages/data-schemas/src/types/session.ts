import type { Document, Types } from 'mongoose';

export interface ISession extends Document {
  refreshTokenHash: string;
  expiration: Date;
  user: Types.ObjectId;
  tenantId?: string;
  /** Present only on Clerk-originated sessions; absent for local/OAuth. */
  authProvider?: 'clerk';
  clerkSessionId?: string;
  clerkTokenId?: string;
  clerkUserId?: string;
  /** `min(SESSION_EXPIRY, 15 minutes from issuance)` — mirrors `expiration` on Clerk sessions. */
  absoluteExpiresAt?: Date;
}

/**
 * Trusted correlation claims for a Clerk-originated session exchange
 * (Fixed Contract 7). `tenantScope` is the claim-storable tenant identifier
 * (a real tenantId, or the tenantless sentinel) — not necessarily identical
 * to the ambient `tenantId` LibreChat's tenant middleware would inject.
 */
export interface ClerkSessionContext {
  authProvider: 'clerk';
  tenantScope: string;
  clerkSessionId: string;
  clerkTokenId: string;
  clerkUserId: string;
  tokenExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export type CreateSessionOptions =
  | {
      clerk?: never;
      expiration?: Date;
      /** Duration in milliseconds for session expiry. Default: 7 days */
      expiresIn?: number;
    }
  | {
      clerk: ClerkSessionContext;
      expiration?: never;
      expiresIn?: never;
    };

export interface UpdateExpirationOptions {
  /** Duration in milliseconds for session expiry. Default: 7 days */
  expiresIn?: number;
}

export interface SessionSearchParams {
  refreshToken?: string;
  userId?: string;
  sessionId?: string | { sessionId: string };
}

export interface SessionQueryOptions {
  lean?: boolean;
}

export interface DeleteSessionParams {
  refreshToken?: string;
  sessionId?: string;
}

export interface DeleteAllSessionsOptions {
  excludeCurrentSession?: boolean;
  currentSessionId?: string;
}

export interface SessionResult {
  session: Partial<ISession>;
  refreshToken: string;
}

export interface SignPayloadParams {
  payload: Record<string, unknown>;
  secret?: string;
  expirationTime: number;
}
