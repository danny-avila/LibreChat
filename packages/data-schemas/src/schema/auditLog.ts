import { Schema } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { IAuditLog } from '~/types';

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      enum: ['grant_assigned', 'grant_removed'],
      required: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorName: {
      type: String,
      required: true,
    },
    targetPrincipalType: {
      type: String,
      enum: Object.values(PrincipalType),
      required: true,
    },
    /**
     * Mixed: ObjectId for USER/GROUP principals, role-name string for ROLE.
     * Normalization (string → ObjectId for USER/GROUP) is the responsibility
     * of the writer (HTTP handler), mirroring the SystemGrant convention.
     */
    targetPrincipalId: {
      type: Schema.Types.Mixed,
      required: true,
    },
    targetName: {
      type: String,
      required: true,
    },
    capability: {
      type: String,
      required: true,
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
      validate: {
        validator: (v: unknown) => v !== null && v !== '',
        message: 'tenantId must be a non-empty string or omitted entirely — never null or empty',
      },
    },
  },
  { timestamps: true },
);

/** Primary listing: tenant + newest-first + tiebreak on _id for keyset pagination. */
auditLogSchema.index({ tenantId: 1, createdAt: -1, _id: -1 });

/** Target facet: filter by who was affected. */
auditLogSchema.index({ tenantId: 1, targetPrincipalType: 1, targetPrincipalId: 1, createdAt: -1 });

export default auditLogSchema;
