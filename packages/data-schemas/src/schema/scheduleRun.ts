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
    /** Monotonic per-occurrence segment counter. Incremented by every resume
     *  reservation; a pause write must CAS on the epoch its segment observed, so a
     *  stale `requires_action` callback can never demote an already-resumed run. */
    resumeSeq: {
      type: Number,
      min: 0,
    },
    /** Identity of the in-flight resume attempt. Presence means RESUMING: the run is
     *  `started` but its generation has not been reconstructed yet. */
    resumeHolder: {
      type: String,
    },
    /** Deadline for the current resume phase, so a crashed resume is reclaimable. */
    resumeExpiresAt: {
      type: Date,
    },
    /** Set once the approval claim succeeded; discriminates pre-claim (rollback-safe)
     *  from post-claim (must roll forward) recovery. */
    resumeClaimedAt: {
      type: Date,
    },
    /** True when the lease ADOPTED an already-`started` row instead of promoting a
     *  paused one. Release must not demote an adopted row (it may be a live run). */
    resumeAdopted: {
      type: Boolean,
    },
    /** Global concurrency slot held while `started`. The unique partial index below
     *  turns fireConcurrency into a DB-enforced bound instead of a racy count. */
    capacitySlot: {
      type: Number,
      min: 0,
    },
    /** When an abort was requested. The run keeps holding its capacity slot until the
     *  generation owner confirms settlement, so capacity is never freed early. */
    abortRequestedAt: {
      type: Date,
    },
    /** The schedule's configRevision at claim time. Fences terminal bookkeeping and
     *  auto-disable from owner edits/re-enables that landed after this run started. */
    configRevision: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

scheduleRunSchema.index({ scheduleId: 1, scheduledFor: 1 }, { unique: true });
// At most ONE active (`started`) run per schedule, enforced by the DB rather than
// a read-then-write check. Makes both the fire-path overlap skip and the HITL
// resume promotion atomic: a second occurrence inserting/promoting to `started`
// while one is already active fails with a duplicate-key error instead of racing.
scheduleRunSchema.index(
  { scheduleId: 1 },
  { unique: true, partialFilterExpression: { status: 'started' } },
);
// GLOBAL fireConcurrency, enforced by the DB rather than a read-then-compare count.
// Every transition into `started` (fire insert, resume promotion) claims a slot in
// [0, fireConcurrency) in the SAME write; a duplicate slot is rejected atomically, so
// two concurrent admissions of DIFFERENT schedules can never both pass a cap-1 check.
// Partial + $exists so legacy slotless rows (written before this field) never collide.
scheduleRunSchema.index(
  { capacitySlot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'started', capacitySlot: { $exists: true } },
  },
);
scheduleRunSchema.index({ scheduleId: 1, firedAt: -1 });
// Reconciliation sweeps by status; keeps `started` (capacity) fetch cheap and
// prevents long-lived `requires_action` rows from starving the scan.
scheduleRunSchema.index({ status: 1, firedAt: 1 });

export default scheduleRunSchema;
