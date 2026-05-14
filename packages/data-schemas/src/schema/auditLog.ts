import { Schema } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { IAuditLog } from '~/types';

/**
 * Append-only by schema contract: every field is `immutable`, every
 * update-style operation is short-circuited in the pre-hooks below, and
 * `updatedAt` is intentionally not maintained — a mutable timestamp would
 * imply mutation is allowed.
 */
const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: ['grant_assigned', 'grant_removed'],
      required: true,
      immutable: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    actorName: {
      type: String,
      required: true,
      immutable: true,
    },
    targetPrincipalType: {
      type: String,
      enum: Object.values(PrincipalType),
      required: true,
      immutable: true,
    },
    /**
     * Mixed: ObjectId for USER/GROUP principals, role-name string for ROLE.
     * Normalization (string → ObjectId for USER/GROUP) is the responsibility
     * of the writer (HTTP handler), mirroring the SystemGrant convention.
     */
    targetPrincipalId: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    targetName: {
      type: String,
      required: true,
      immutable: true,
    },
    capability: {
      type: String,
      required: true,
      immutable: true,
    },
    /**
     * Platform-level audit entries MUST omit this field entirely — never set
     * it to null. Queries for platform-level entries use
     * `{ tenantId: { $exists: false } }`, which matches absent fields but NOT
     * `null`. A document stored with `{ tenantId: null }` would silently match
     * neither platform-level nor tenant-scoped queries.
     */
    tenantId: {
      type: String,
      required: false,
      immutable: true,
      validate: {
        validator: (v: unknown) => typeof v === 'string' && v.trim().length > 0,
        message:
          'tenantId must be a non-empty string or omitted entirely — never null, empty, or a non-string value',
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const APPEND_ONLY_MESSAGE = 'AuditLog is append-only — updates and deletes are forbidden';

/** Block every query-level update path. */
auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne'],
  function (next) {
    next(new Error(APPEND_ONLY_MESSAGE));
  },
);

/** Block every query-level delete path. */
auditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error(APPEND_ONLY_MESSAGE));
});

/**
 * Document-level `save` is allowed for new docs only. A second save on an
 * existing document would mutate it, so reject that case explicitly.
 */
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error(APPEND_ONLY_MESSAGE));
    return;
  }
  next();
});

/**
 * Primary listing: tenant + newest-first sort with `_id` as a deterministic
 * tiebreak for offset pagination so adjacent pages never duplicate or skip rows
 * when two entries share a `createdAt` timestamp.
 */
auditLogSchema.index({ tenantId: 1, createdAt: -1, _id: -1 });

/** Target facet: filter by who was affected. */
auditLogSchema.index({ tenantId: 1, targetPrincipalType: 1, targetPrincipalId: 1, createdAt: -1 });

export default auditLogSchema;
