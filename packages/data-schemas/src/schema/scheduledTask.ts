import { Schema } from 'mongoose';
import type { IScheduledTask } from '~/types';

const scheduledTaskSchema = new Schema<IScheduledTask>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    targetType: {
      type: String,
      enum: ['model'],
      required: true,
      default: 'model',
    },
    targetId: {
      type: String,
      required: true,
    },
    triggerType: {
      type: String,
      enum: ['cron'],
      required: true,
      default: 'cron',
    },
    expression: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'failed'],
      default: 'active',
      index: true,
    },
    lastRunAt: {
      type: Date,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

scheduledTaskSchema.index({ userId: 1, status: 1 });
scheduledTaskSchema.index({ targetType: 1, targetId: 1 });

export default scheduledTaskSchema;
