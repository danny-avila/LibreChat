import { Schema } from 'mongoose';
import type { IClerkAuthClaim } from '~/types';

const CONSUMED_TOKEN_ONLY_FIELDS = [
  'tenantScope',
  'clerkTokenId',
  'sourceClerkSessionId',
  'sourceClerkUserId',
] as const;
const SESSION_STATE_ONLY_FIELDS = ['clerkSessionId', 'revokedAt'] as const;
const USER_STATE_ONLY_FIELDS = ['clerkUserId', 'deletedAt'] as const;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Enforces the exact discriminated shape per `kind` (Fixed Contract 5): no
 * cross-shape fields, no null/empty/whitespace strings, and the
 * state/timestamp pairing each variant requires. Schema-level validation is
 * the last line of defense against a legacy/direct write bypassing the typed
 * `ClerkAuthClaimInput` union.
 */
function validateClerkAuthClaimShape(doc: IClerkAuthClaim): string | undefined {
  if (!isPresent(doc.expiration) || Number.isNaN(new Date(doc.expiration).getTime())) {
    return 'expiration is required and must be a valid Date';
  }

  if (doc.kind === 'consumed_token') {
    for (const field of [...SESSION_STATE_ONLY_FIELDS, ...USER_STATE_ONLY_FIELDS, 'state']) {
      if (isPresent((doc as unknown as Record<string, unknown>)[field])) {
        return `consumed_token claims must not set "${field}"`;
      }
    }
    for (const field of CONSUMED_TOKEN_ONLY_FIELDS) {
      if (isBlank((doc as unknown as Record<string, unknown>)[field])) {
        return `consumed_token claims require a non-blank "${field}"`;
      }
    }
    return undefined;
  }

  if (doc.kind === 'session_state') {
    for (const field of [...CONSUMED_TOKEN_ONLY_FIELDS, ...USER_STATE_ONLY_FIELDS]) {
      if (isPresent((doc as unknown as Record<string, unknown>)[field])) {
        return `session_state claims must not set "${field}"`;
      }
    }
    if (isBlank(doc.clerkSessionId)) {
      return 'session_state claims require a non-blank "clerkSessionId"';
    }
    if (doc.state !== 'active' && doc.state !== 'revoked') {
      return 'session_state claims require state "active" or "revoked"';
    }
    if (doc.state === 'revoked' && !isPresent(doc.revokedAt)) {
      return 'session_state claims with state "revoked" require "revokedAt"';
    }
    if (doc.state === 'active' && isPresent(doc.revokedAt)) {
      return 'session_state claims with state "active" must not set "revokedAt"';
    }
    return undefined;
  }

  if (doc.kind === 'user_state') {
    for (const field of [...CONSUMED_TOKEN_ONLY_FIELDS, ...SESSION_STATE_ONLY_FIELDS]) {
      if (isPresent((doc as unknown as Record<string, unknown>)[field])) {
        return `user_state claims must not set "${field}"`;
      }
    }
    if (isBlank(doc.clerkUserId)) {
      return 'user_state claims require a non-blank "clerkUserId"';
    }
    if (doc.state !== 'active' && doc.state !== 'deleted') {
      return 'user_state claims require state "active" or "deleted"';
    }
    if (doc.state === 'deleted' && !isPresent(doc.deletedAt)) {
      return 'user_state claims with state "deleted" require "deletedAt"';
    }
    if (doc.state === 'active' && isPresent(doc.deletedAt)) {
      return 'user_state claims with state "active" must not set "deletedAt"';
    }
    return undefined;
  }

  return `unknown ClerkAuthClaim kind "${String(doc.kind)}"`;
}

const clerkAuthClaimSchema: Schema<IClerkAuthClaim> = new Schema<IClerkAuthClaim>(
  {
    kind: {
      type: String,
      enum: ['consumed_token', 'session_state', 'user_state'],
      required: true,
    },
    expiration: {
      type: Date,
      required: true,
    },
    tenantScope: { type: String },
    clerkTokenId: { type: String },
    sourceClerkSessionId: { type: String },
    sourceClerkUserId: { type: String },
    clerkSessionId: { type: String },
    clerkUserId: { type: String },
    state: {
      type: String,
      enum: ['active', 'revoked', 'deleted'],
    },
    revokedAt: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

clerkAuthClaimSchema.pre('validate', function (next) {
  const error = validateClerkAuthClaimShape(this);
  if (error) {
    next(new Error(`[ClerkAuthClaim] ${error}`));
    return;
  }
  next();
});

clerkAuthClaimSchema.index(
  { tenantScope: 1, clerkTokenId: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'consumed_token' },
    name: 'tenantScope_1_clerkTokenId_1',
  },
);
clerkAuthClaimSchema.index(
  { clerkSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'session_state' },
    name: 'clerkSessionId_1',
  },
);
clerkAuthClaimSchema.index(
  { clerkUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'user_state' },
    name: 'clerkUserId_1',
  },
);
clerkAuthClaimSchema.index({ expiration: 1 }, { expireAfterSeconds: 0, name: 'expiration_1' });

export default clerkAuthClaimSchema;
