import { Schema } from 'mongoose';
import type { IQuota } from '~/types/quota';

const quotaSchema = new Schema<IQuota>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    period_start: {
      type: Date,
      required: true,
    },
    messages_used: {
      type: Number,
      default: 0,
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

quotaSchema.index({ user_id: 1, period_start: 1 }, { unique: true });

export default quotaSchema;
