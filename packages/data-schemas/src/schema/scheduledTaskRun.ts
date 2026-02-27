import { Schema } from 'mongoose';
import type { IScheduledTaskRun } from '~/types';

const scheduledTaskRunSchema = new Schema<IScheduledTaskRun>(
  {
    taskId: {
      type: String,
      required: true,
      index: true,
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
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      default: null,
    },
    errorType: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    errorDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

scheduledTaskRunSchema.index({ taskId: 1, startedAt: -1 });

export default scheduledTaskRunSchema;
