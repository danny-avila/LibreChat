import { Schema } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import type { IAuditLog } from '~/types/admin';

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetPrincipalType: {
      type: String,
      enum: Object.values(PrincipalType),
    },
    targetPrincipalId: {
      type: String,
      index: true,
    },
    targetName: {
      type: String,
    },
    capability: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });

export default auditLogSchema;
