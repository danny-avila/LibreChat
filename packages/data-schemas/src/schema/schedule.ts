import { Schema } from 'mongoose';
import type { IScheduleDocument } from '~/types/schedule';

const scheduleSchema: Schema<IScheduleDocument> = new Schema(
  {
    id: {
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
    tenantId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 256,
    },
    prompt: {
      type: String,
      required: true,
      maxlength: 32000,
    },
    agent_id: {
      type: String,
      required: true,
    },
    cadence: {
      frequency: {
        type: String,
        enum: ['hourly', 'daily', 'weekdays', 'weekly'],
        required: true,
      },
      hour: { type: Number, min: 0, max: 23, required: true },
      minute: { type: Number, min: 0, max: 59, required: true },
      daysOfWeek: { type: [Number], default: undefined },
    },
    timezone: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      enum: ['new'],
      default: 'new',
      required: true,
    },
    file_ids: {
      type: [String],
      default: undefined,
    },
    tools: {
      type: [String],
      default: undefined,
    },
    cron: {
      type: String,
    },
    enabled: {
      type: Boolean,
      default: true,
      required: true,
    },
    disabledReason: {
      type: String,
      enum: [
        'too_many_failures',
        'agent_deleted',
        'invalid_schedule',
        'permission_revoked',
        'insufficient_balance',
      ],
    },
    nextRunAt: {
      type: Date,
    },
    leaseUntil: {
      type: Date,
    },
    leaseBy: {
      type: String,
    },
    lastRun: {
      type: {
        conversationId: { type: String },
        status: { type: String, required: true },
        error: { type: String },
        firedAt: { type: Date, required: true },
      },
      default: undefined,
      _id: false,
    },
    runCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceSkipCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

scheduleSchema.index({ id: 1, tenantId: 1 }, { unique: true });
scheduleSchema.index({ enabled: 1, nextRunAt: 1 });

export default scheduleSchema;
