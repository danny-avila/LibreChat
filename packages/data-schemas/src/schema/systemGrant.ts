import { Schema } from 'mongoose';
import type { ISystemGrant } from '~/types';

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
    tenantId: {
      type: String,
      required: false,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

systemGrantSchema.index(
  { principalType: 1, principalId: 1, capability: 1, tenantId: 1 },
  { unique: true, sparse: true },
);

systemGrantSchema.index({ capability: 1, tenantId: 1 });

export default systemGrantSchema;
