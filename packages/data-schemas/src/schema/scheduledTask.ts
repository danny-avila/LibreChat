import { Schema } from 'mongoose';
import type { IScheduledTask } from '~/types';

const scheduledTaskSchema = new Schema<IScheduledTask>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['agent', 'assistant'],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    triggerType: {
      type: String,
      enum: ['cron', 'interval', 'date'],
      required: true,
    },
    expression: {
      type: String,
      required: true,
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
