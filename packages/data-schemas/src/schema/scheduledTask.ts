import { Schema } from 'mongoose';
import type { IScheduledTask } from '~/types';

const scheduledTaskSchema = new Schema<IScheduledTask>(
  {
    id: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 256,
    },
    description: {
      type: String,
      maxlength: 1024,
    },
    prompt: {
      type: String,
      required: true,
    },
    cron: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    nextRunAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastRunStatus: {
      type: String,
      default: null,
    },
    lastRunId: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduledTaskRun',
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

scheduledTaskSchema.index({ user: 1, id: 1 });
scheduledTaskSchema.index({ enabled: 1, nextRunAt: 1 });

export default scheduledTaskSchema;
