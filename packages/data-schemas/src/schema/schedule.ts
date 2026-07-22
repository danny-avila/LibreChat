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
    /**
     * Per-claim fencing token. Set fresh on every lease acquisition (engine or
     * manual) and rotated on every owner edit, so a stale/expired-lease worker's
     * writes (disable/advance/release) and its pre-dispatch revalidation no-op
     * once the schedule was re-claimed, edited, re-enabled, or deleted.
     */
    claimToken: {
      type: String,
    },
    /**
     * Soft-delete marker. A delete disables + marks the schedule `deleting` (so
     * it is hidden from the owner and never re-claimed) and aborts in-flight
     * runs; the reconciler erases it only once no run is still active, so a live
     * loopback generation's evidence is never destroyed out from under it.
     * Defaults false so the per-user `slot` partial unique index covers it.
     */
    deleting: {
      type: Boolean,
      default: false,
    },
    /**
     * Per-user occupancy slot in [0, maxPerUser). Assigned atomically via the
     * partial unique index below so concurrent creates cannot exceed the cap: two
     * racers claiming the same slot collide on the index and one retries the next
     * free slot. Freed (excluded from the index) when the schedule is `deleting`.
     */
    slot: {
      type: Number,
      min: 0,
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
    /**
     * Bounded set of recently-counted occurrence timestamps. Per-occurrence
     * idempotency guard for `recordRunOutcome` counter increments: a single
     * scalar could be moved by an interleaved earlier occurrence, letting the
     * reconciler double-count a crashed later one. Kept bounded via `$slice`.
     */
    countedFor: {
      type: [Date],
      default: undefined,
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
// Atomic per-user create cap: a live (non-deleting) schedule occupies a unique
// slot, so concurrent creates cannot collectively exceed maxPerUser — a second
// claimant of the same slot collides and retries the next free one. Scoped to
// slot-bearing docs so the (non-user-facing) slotless create path is unaffected.
scheduleSchema.index(
  { user: 1, slot: 1 },
  { unique: true, partialFilterExpression: { deleting: false, slot: { $exists: true } } },
);

export default scheduleSchema;
