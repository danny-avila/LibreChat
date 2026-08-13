import mongoose, { Schema } from 'mongoose';
import { ISession } from '~/types';

const CLERK_ONLY_FIELDS = ['clerkSessionId', 'clerkTokenId', 'clerkUserId'] as const;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Clerk correlation is all-or-none (Fixed Contract 7): a Clerk session must
 * carry every correlation field, non-blank, with `expiration` equal to
 * `absoluteExpiresAt`; a non-Clerk session must carry none of them.
 */
function validateClerkSessionShape(this: ISession): string | undefined {
  if (this.authProvider !== 'clerk') {
    for (const field of [...CLERK_ONLY_FIELDS, 'absoluteExpiresAt']) {
      if ((this as unknown as Record<string, unknown>)[field] !== undefined) {
        return `non-Clerk sessions must not set "${field}"`;
      }
    }
    return undefined;
  }

  for (const field of CLERK_ONLY_FIELDS) {
    if (isBlank((this as unknown as Record<string, unknown>)[field])) {
      return `Clerk sessions require a non-blank "${field}"`;
    }
  }
  if (!(this.absoluteExpiresAt instanceof Date) || Number.isNaN(this.absoluteExpiresAt.getTime())) {
    return 'Clerk sessions require a valid "absoluteExpiresAt"';
  }
  if (this.expiration?.getTime() !== this.absoluteExpiresAt.getTime()) {
    return '"expiration" must equal "absoluteExpiresAt" on Clerk sessions';
  }
  return undefined;
}

const sessionSchema: Schema<ISession> = new Schema({
  refreshTokenHash: {
    type: String,
    required: true,
  },
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tenantId: {
    type: String,
    index: true,
  },
  authProvider: {
    type: String,
    enum: ['clerk'],
  },
  clerkSessionId: {
    type: String,
  },
  clerkTokenId: {
    type: String,
  },
  clerkUserId: {
    type: String,
  },
  absoluteExpiresAt: {
    type: Date,
  },
});

sessionSchema.pre('validate', function (next) {
  const error = validateClerkSessionShape.call(this);
  if (error) {
    next(new Error(`[Session] ${error}`));
    return;
  }
  next();
});

sessionSchema.index(
  { clerkTokenId: 1, tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: { clerkTokenId: { $exists: true } },
    name: 'clerkTokenId_1_tenantId_1',
  },
);
sessionSchema.index(
  { clerkSessionId: 1, tenantId: 1 },
  {
    partialFilterExpression: { clerkSessionId: { $exists: true } },
    name: 'clerkSessionId_1_tenantId_1',
  },
);
sessionSchema.index(
  { clerkUserId: 1, tenantId: 1 },
  {
    partialFilterExpression: { clerkUserId: { $exists: true } },
    name: 'clerkUserId_1_tenantId_1',
  },
);

export default sessionSchema;
