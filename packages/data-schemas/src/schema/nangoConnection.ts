import { Schema } from 'mongoose';
import type { INangoConnection } from '~/types';

const nangoConnectionSchema = new Schema<INangoConnection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: false,
      index: true,
    },
    providerKey: {
      type: String,
      required: true,
    },
    nangoIntegrationId: {
      type: String,
      required: true,
    },
    connectionId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['connected', 'expired', 'revoked'],
      default: 'connected',
      required: true,
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

nangoConnectionSchema.index({ userId: 1, providerKey: 1 }, { unique: true });
nangoConnectionSchema.index({ tenantId: 1, providerKey: 1 });

export default nangoConnectionSchema;
