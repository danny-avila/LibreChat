import { Schema } from 'mongoose';
import type { IAuditLog } from '~/types/auditLog';

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    target_user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

auditLogSchema.index({ actor_id: 1, created_at: -1 });

export default auditLogSchema;
