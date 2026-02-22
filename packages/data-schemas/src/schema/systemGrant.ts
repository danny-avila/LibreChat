import { Schema } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { ISystemGrant } from '~/types';
import { normalizePrincipalId } from '~/utils/principal';

const systemGrantSchema = new Schema<ISystemGrant>(
  {
    principalType: {
      type: String,
      required: true,
    },
    principalId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    capability: {
      type: String,
      required: true,
    },
    /**
     * Platform-level grants MUST omit this field entirely — never set it to null.
     * Queries for platform-level grants use `{ tenantId: { $exists: false } }`, which
     * matches absent fields but NOT `null`. A document stored with `{ tenantId: null }`
     * would silently match neither platform-level nor tenant-scoped queries.
     */
    tenantId: {
      type: String,
      required: false,
      validate: {
        validator: (v: unknown) => v !== null,
        message: 'tenantId must be a non-empty string or omitted entirely — never null',
      },
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    /** Reserved for future TTL enforcement — time-bounded / temporary grants. Not enforced yet. */
    expiresAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true },
);

/**
 * Normalize principalId to ObjectId for USER/GROUP principals before save,
 * ensuring consistent type regardless of how the document was constructed.
 * ROLE principals always use string IDs (role names).
 */
systemGrantSchema.pre('save', function () {
  this.principalId = normalizePrincipalId(
    this.principalId as string | import('mongoose').Types.ObjectId,
    this.principalType as PrincipalType,
  );
});

systemGrantSchema.index(
  { principalType: 1, principalId: 1, capability: 1, tenantId: 1 },
  { unique: true },
);

systemGrantSchema.index({ capability: 1, tenantId: 1 });

export default systemGrantSchema;
