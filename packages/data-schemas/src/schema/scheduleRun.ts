import { Schema } from 'mongoose';
import type { IScheduleRunDocument } from '~/types/schedule';

const SCHEDULE_RUN_TTL_SECONDS = 90 * 24 * 60 * 60;

const scheduleRunSchema: Schema<IScheduleRunDocument> = new Schema(
  {
    scheduleId: {
      type: String,
      required: true,
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
    scheduledFor: {
      type: Date,
      required: true,
    },
    firedAt: {
      type: Date,
      index: { expireAfterSeconds: SCHEDULE_RUN_TTL_SECONDS },
    },
    conversationId: {
      type: String,
    },
    status: {
      type: String,
      enum: [
        'started',
        'requires_action',
        'success',
        'error',
        'interrupted',
        'skipped_overlap',
        'skipped_balance',
      ],
      required: true,
    },
    error: {
      type: String,
      maxlength: 2048,
    },
    droppedFileIds: {
      type: [String],
      default: undefined,
    },
    durationMs: {
      type: Number,
      min: 0,
    },
    /** False on a terminal run whose schedule bookkeeping hasn't landed yet (crash-retry marker). */
    bookkept: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
  },
);

scheduleRunSchema.index({ scheduleId: 1, scheduledFor: 1 }, { unique: true });
scheduleRunSchema.index({ scheduleId: 1, firedAt: -1 });
// Reconciliation sweeps by status; keeps `started` (capacity) fetch cheap and
// prevents long-lived `requires_action` rows from starving the scan.
scheduleRunSchema.index({ status: 1, firedAt: 1 });

export default scheduleRunSchema;
