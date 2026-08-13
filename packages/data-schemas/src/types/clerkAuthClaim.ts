import type { Document } from 'mongoose';

/** Sentinel `tenantScope` value for a claim tied to a tenantless (legacy) login. */
export const CLERK_TENANTLESS_SCOPE = '__CLERK_TENANTLESS__';

export type ClerkAuthClaimKind = 'consumed_token' | 'session_state' | 'user_state';

/**
 * Flattened Mongoose storage shape for the global `ClerkAuthClaim` collection.
 * All variant-specific fields are optional here — `applyClerkAuthClaimValidation`
 * enforces the exact discriminated shape from `ClerkAuthClaimInput` at write time.
 */
export interface IClerkAuthClaim extends Document {
  kind: ClerkAuthClaimKind;
  expiration: Date;
  /** consumed_token only */
  tenantScope?: string;
  clerkTokenId?: string;
  sourceClerkSessionId?: string;
  sourceClerkUserId?: string;
  /** session_state only */
  clerkSessionId?: string;
  /** user_state only */
  clerkUserId?: string;
  /** session_state | user_state */
  state?: 'active' | 'revoked' | 'deleted';
  revokedAt?: Date;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ClerkConsumedTokenInput {
  kind: 'consumed_token';
  tenantScope: string;
  clerkTokenId: string;
  sourceClerkSessionId: string;
  sourceClerkUserId: string;
  expiration: Date;
}

export type ClerkSessionStateInput =
  | {
      kind: 'session_state';
      clerkSessionId: string;
      state: 'active';
      revokedAt?: never;
      expiration: Date;
    }
  | {
      kind: 'session_state';
      clerkSessionId: string;
      state: 'revoked';
      revokedAt: Date;
      expiration: Date;
    };

export type ClerkUserStateInput =
  | {
      kind: 'user_state';
      clerkUserId: string;
      state: 'active';
      deletedAt?: never;
      expiration: Date;
    }
  | {
      kind: 'user_state';
      clerkUserId: string;
      state: 'deleted';
      deletedAt: Date;
      expiration: Date;
    };

export type ClerkAuthClaimInput =
  | ClerkConsumedTokenInput
  | ClerkSessionStateInput
  | ClerkUserStateInput;
