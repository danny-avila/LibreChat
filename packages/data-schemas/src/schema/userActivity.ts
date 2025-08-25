import { Schema, Types } from 'mongoose';

export const userActivityLogSchema = new Schema(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['LOGIN', 'LOGOUT', 'ATTACHED FILE', 'MODEL CHANGED'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: {
        type: Schema.Types.Mixed,
        required: false,
      },
      
  },
  { timestamps: true }
);
userActivityLogSchema.index({ user: 1, timestamp: -1 });
userActivityLogSchema.index({ action: 1, timestamp: -1 });

