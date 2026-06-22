import { Schema } from 'mongoose';
import type { IUsageLog } from '~/types/usageLog';

const usageLogSchema = new Schema<IUsageLog>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    model_id: {
      type: String,
      required: true,
    },
    day: {
      type: Date,
      required: true,
    },
    prompt_tokens: {
      type: Number,
      default: 0,
    },
    completion_tokens: {
      type: Number,
      default: 0,
    },
    call_count: {
      type: Number,
      default: 0,
    },
    estimated_cost_cents: {
      type: Number,
      default: 0,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

usageLogSchema.index({ user_id: 1, model_id: 1, day: 1 }, { unique: true });
usageLogSchema.index({ day: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export default usageLogSchema;
