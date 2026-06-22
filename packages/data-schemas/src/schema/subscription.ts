import { Schema } from 'mongoose';
import type { ISubscription } from '~/types/subscription';

const subscriptionSchema = new Schema<ISubscription>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan_code: {
      type: String,
      enum: ['free', 'trial', 'pro_m', 'pro_q', 'pro_h'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'expired', 'admin_granted'],
      required: true,
    },
    source: {
      type: String,
      enum: ['admin', 'stripe', 'system_default', 'cli'],
      required: true,
    },
    current_period_start: {
      type: Date,
      required: true,
    },
    current_period_end: {
      type: Date,
      required: true,
    },
    external_ref: {
      type: String,
      default: null,
    },
    granted_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

subscriptionSchema.index({ user_id: 1, status: 1 });
subscriptionSchema.index({ user_id: 1, current_period_start: -1 });
subscriptionSchema.index({ external_ref: 1 }, { sparse: true });

export default subscriptionSchema;
