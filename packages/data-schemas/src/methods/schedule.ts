import type { ScheduleRunStatus, ScheduleDisabledReason } from 'librechat-data-provider';
import type { Model, Types } from 'mongoose';
import type {
  ISchedule,
  IScheduleDocument,
  IScheduleRun,
  IScheduleRunDocument,
} from '~/types/schedule';
import { createIndexesWithRetry } from '~/utils/retry';

const DUPLICATE_KEY = 11000;

/**
 * Upper bound on the per-schedule `countedFor` idempotency set. Far larger than
 * the number of a single schedule's occurrences that can be terminal (or awaiting
 * reconciliation) at once, so an occurrence's marker is never evicted before any
 * possible crash-replay, while the array stays bounded.
 */
const COUNTED_FOR_WINDOW = 64;

export interface ClaimDueScheduleParams {
  instanceId: string;
  leaseMs: number;
  now?: Date;
}

export interface RecordRunOutcomeParams {
  scheduleId: string;
  scheduledFor: Date;
  status: Extract<ScheduleRunStatus, 'success' | 'error' | 'requires_action' | 'interrupted'>;
  conversationId?: string;
  error?: string;
  durationMs?: number;
  autoDisableAfterFailures: number;
}

export type ScheduleMethods = {
  ensureScheduleIndexes: () => Promise<void>;
  createSchedule: (data: Partial<ISchedule>) => Promise<ISchedule>;
  updateScheduleById: (
    id: string,
    userId: string | Types.ObjectId,
    update: Partial<ISchedule>,
    unset?: Record<string, 1>,
  ) => Promise<ISchedule | null>;
  deleteScheduleById: (id: string, userId: string | Types.ObjectId) => Promise<boolean>;
  getScheduleById: (id: string, userId?: string | Types.ObjectId) => Promise<ISchedule | null>;
  getSchedulesByUser: (userId: string | Types.ObjectId) => Promise<ISchedule[]>;
  countSchedulesByUser: (userId: string | Types.ObjectId) => Promise<number>;
  countSchedulesAheadOf: (userId: string | Types.ObjectId, id: Types.ObjectId) => Promise<number>;
  claimDueSchedule: (params: ClaimDueScheduleParams) => Promise<ISchedule | null>;
  acquireManualRunLease: (
    id: string,
    userId: string | Types.ObjectId,
    leaseMs: number,
  ) => Promise<boolean>;
  releaseLease: (id: string) => Promise<void>;
  advanceSchedule: (id: string, nextRunAt: Date | null) => Promise<void>;
  disableSchedule: (id: string, reason: ScheduleDisabledReason) => Promise<void>;
  insertScheduleRun: (data: Partial<IScheduleRun>) => Promise<IScheduleRun | null>;
  setRunFireDetails: (
    scheduleId: string,
    scheduledFor: Date,
    details: { conversationId: string; droppedFileIds?: string[] },
  ) => Promise<void>;
  hasActiveRun: (scheduleId: string) => Promise<boolean>;
  countActiveRuns: () => Promise<number>;
  deleteScheduleRun: (scheduleId: string, scheduledFor: Date) => Promise<void>;
  deleteSchedulesByUser: (userId: string | Types.ObjectId) => Promise<void>;
  getUnbookkeptRuns: (olderThan: Date, limit: number) => Promise<IScheduleRun[]>;
  finalizeBookkeeping: (params: RecordRunOutcomeParams) => Promise<void>;
  recordRunOutcome: (params: RecordRunOutcomeParams) => Promise<void>;
  recordSkippedRun: (
    data: Partial<IScheduleRun> & {
      scheduleId: string;
      scheduledFor: Date;
      status: Extract<ScheduleRunStatus, 'skipped_overlap' | 'skipped_balance'>;
    },
    balanceSkipDisableThreshold?: number,
  ) => Promise<void>;
  getRunsForReconciliation: (olderThan: Date, limit: number) => Promise<IScheduleRun[]>;
  transitionRunStatus: (
    scheduleId: string,
    scheduledFor: Date,
    from: ScheduleRunStatus,
    to: ScheduleRunStatus,
  ) => Promise<boolean>;
};

export function createScheduleMethods(mongoose: typeof import('mongoose')): ScheduleMethods {
  const Schedule = () => mongoose.models.Schedule as Model<IScheduleDocument>;
  const ScheduleRun = () => mongoose.models.ScheduleRun as Model<IScheduleRunDocument>;

  /**
   * Explicitly builds the Schedule/ScheduleRun indexes. Required because the
   * standard production setting `MONGO_AUTO_INDEX=` (empty) disables Mongoose's
   * automatic index creation — without this the unique idempotency index and the
   * TTL retention index would never exist. Called once before the engine starts.
   */
  async function ensureScheduleIndexes(): Promise<void> {
    await createIndexesWithRetry(Schedule());
    await createIndexesWithRetry(ScheduleRun());
  }

  async function createSchedule(data: Partial<ISchedule>): Promise<ISchedule> {
    const doc = await Schedule().create(data);
    return doc.toObject();
  }

  async function updateScheduleById(
    id: string,
    userId: string | Types.ObjectId,
    update: Partial<ISchedule>,
    unset?: Record<string, 1>,
  ): Promise<ISchedule | null> {
    return Schedule()
      .findOneAndUpdate(
        { id, user: userId },
        { $set: update, ...(unset ? { $unset: unset } : {}) },
        { new: true },
      )
      .lean<ISchedule>();
  }

  async function deleteScheduleById(id: string, userId: string | Types.ObjectId): Promise<boolean> {
    const result = await Schedule().deleteOne({ id, user: userId });
    if (result.deletedCount > 0) {
      await ScheduleRun().deleteMany({ scheduleId: id });
      return true;
    }
    return false;
  }

  async function getScheduleById(
    id: string,
    userId?: string | Types.ObjectId,
  ): Promise<ISchedule | null> {
    const filter: Record<string, unknown> = { id };
    if (userId != null) {
      filter.user = userId;
    }
    return Schedule().findOne(filter).lean<ISchedule>();
  }

  async function getSchedulesByUser(userId: string | Types.ObjectId): Promise<ISchedule[]> {
    return Schedule()
      .find({ user: userId })
      .sort({ updatedAt: -1 })
      .select('-leaseUntil -leaseBy')
      .lean<ISchedule[]>();
  }

  async function countSchedulesByUser(userId: string | Types.ObjectId): Promise<number> {
    return Schedule().countDocuments({ user: userId });
  }

  /**
   * Count of the user's schedules ordered strictly before `id` (by the total,
   * monotonic `_id` order). Used to resolve a deterministic per-limit rank so
   * racing creates converge on the same winner instead of all self-deleting.
   */
  async function countSchedulesAheadOf(
    userId: string | Types.ObjectId,
    id: Types.ObjectId,
  ): Promise<number> {
    return Schedule().countDocuments({ user: userId, _id: { $lt: id } });
  }

  /**
   * Atomically claims one due schedule by taking a lease. The per-document CAS
   * is the sole multi-instance dispatch arbiter: exactly one caller wins each
   * due schedule regardless of replica count, with or without Redis.
   */
  async function claimDueSchedule(params: ClaimDueScheduleParams): Promise<ISchedule | null> {
    const now = params.now ?? new Date();
    return Schedule()
      .findOneAndUpdate(
        {
          enabled: true,
          nextRunAt: { $lte: now },
          $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }],
        },
        {
          $set: {
            leaseUntil: new Date(now.getTime() + params.leaseMs),
            leaseBy: params.instanceId,
          },
        },
        { new: true, sort: { nextRunAt: 1 } },
      )
      .lean<ISchedule>();
  }

  /**
   * Takes the schedule's lease for a manual run-now, serializing concurrent
   * `POST /:id/run` requests (and blocking against an engine claim) so a
   * double-click can't start two runs. Owner-scoped. Returns false if leased.
   */
  async function acquireManualRunLease(
    id: string,
    userId: string | Types.ObjectId,
    leaseMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const row = await Schedule()
      .findOneAndUpdate(
        {
          id,
          user: userId,
          $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }],
        },
        { $set: { leaseUntil: new Date(now.getTime() + leaseMs), leaseBy: 'manual' } },
        { new: true },
      )
      .lean<ISchedule>();
    return row != null;
  }

  /** Releases a lease WITHOUT advancing nextRunAt (manual runs never reschedule). */
  async function releaseLease(id: string): Promise<void> {
    await Schedule().updateOne({ id }, { $unset: { leaseUntil: 1, leaseBy: 1 } });
  }

  /** Advances past a fired (or skipped) occurrence and releases the lease. */
  async function advanceSchedule(id: string, nextRunAt: Date | null): Promise<void> {
    await Schedule().updateOne(
      { id },
      {
        $set: { ...(nextRunAt ? { nextRunAt } : {}) },
        $unset: { leaseUntil: 1, leaseBy: 1, ...(nextRunAt ? {} : { nextRunAt: 1 }) },
      },
    );
  }

  async function disableSchedule(id: string, reason: ScheduleDisabledReason): Promise<void> {
    await Schedule().updateOne(
      { id },
      { $set: { enabled: false, disabledReason: reason }, $unset: { leaseUntil: 1, leaseBy: 1 } },
    );
  }

  /**
   * Inserts the run row BEFORE firing. The unique {scheduleId, scheduledFor}
   * index makes this the durable idempotency claim: null means this occurrence
   * was already fired (or is in flight) by another claimer or a prior life.
   */
  async function insertScheduleRun(data: Partial<IScheduleRun>): Promise<IScheduleRun | null> {
    try {
      const doc = await ScheduleRun().create(data);
      return doc.toObject();
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        return null;
      }
      throw error;
    }
  }

  async function hasActiveRun(scheduleId: string): Promise<boolean> {
    const row = await ScheduleRun().findOne({ scheduleId, status: 'started' }).select('_id').lean();
    return row != null;
  }

  /** Count of in-flight scheduled runs (across all schedules) for the fire cap. */
  async function countActiveRuns(): Promise<number> {
    return ScheduleRun().countDocuments({ status: 'started' });
  }

  /**
   * Applies the schedule-side bookkeeping (lastRun + counters + auto-disable) for
   * a terminal occurrence. Idempotent via the per-occurrence `countedFor` guard:
   * the $inc lands at most once per occurrence no matter how many times it is
   * retried (inline finish, reconciler catch of an un-`bookkept` run, crash-replay),
   * even when a later occurrence's counting interleaves with an earlier paused one.
   */
  async function applyTerminalBookkeeping(
    params: RecordRunOutcomeParams & { firedAt: Date },
  ): Promise<void> {
    const lastRun = {
      conversationId: params.conversationId,
      status: params.status,
      error: params.error,
      firedAt: params.firedAt,
    };
    const isFailure = params.status === 'error';
    const isSuccess = params.status === 'success';
    // The COUNT is idempotent per occurrence: `countedFor` is a bounded set of
    // recently-counted occurrence timestamps, so an interleaved earlier occurrence
    // can't clear this one's marker (a single scalar could). Everything that must
    // land atomically WITH the count goes in this one update so a crash can't leave
    // it half-applied: the balance-skip streak resets on ANY non-balance outcome,
    // and a success clears the failure streak inline (never a lost follow-up).
    await Schedule().updateOne(
      { id: params.scheduleId, countedFor: { $ne: params.scheduledFor } },
      {
        $set: {
          lastRun,
          balanceSkipCount: 0,
          ...(isSuccess ? { failureCount: 0 } : {}),
        },
        $push: { countedFor: { $each: [params.scheduledFor], $slice: -COUNTED_FOR_WINDOW } },
        ...(isSuccess ? { $inc: { runCount: 1 } } : {}),
        ...(isFailure ? { $inc: { failureCount: 1 } } : {}),
        ...(isSuccess ? { $unset: { disabledReason: 1 } } : {}),
      },
    );
    // Auto-disable is a POLICY re-evaluated on EVERY call (idempotent), NOT gated
    // on the count guard — so if a crash landed the $inc but not the disable, the
    // reconciler's replay still disables. Reads current state after the count.
    if (isFailure) {
      const schedule = await Schedule().findOne({ id: params.scheduleId }).lean<ISchedule>();
      if (schedule?.enabled && schedule.failureCount >= params.autoDisableAfterFailures) {
        await disableSchedule(params.scheduleId, 'too_many_failures');
      }
    }
  }

  /**
   * Terminal (or pause) transition for a run + lastRun/failure bookkeeping.
   * Matches a run row still in `started` OR `requires_action`. Crash-retryable:
   * the run row is marked `bookkept:false` at terminalization and only flipped
   * to `true` after bookkeeping lands, so a crash in between is re-applied by the
   * reconciler (`getUnbookkeptRuns`), while `countedFor` keeps it idempotent.
   */
  async function recordRunOutcome(params: RecordRunOutcomeParams): Promise<void> {
    const firedAt = new Date();
    const isTerminal = params.status !== 'requires_action';
    const matched = await ScheduleRun().updateOne(
      {
        scheduleId: params.scheduleId,
        scheduledFor: params.scheduledFor,
        status: { $in: ['started', 'requires_action'] },
      },
      {
        $set: {
          status: params.status,
          ...(isTerminal ? { bookkept: false } : {}),
          ...(params.conversationId ? { conversationId: params.conversationId } : {}),
          ...(params.error ? { error: params.error } : {}),
          ...(params.durationMs != null ? { durationMs: params.durationMs } : {}),
        },
      },
    );
    // No-match guard: never touch schedule bookkeeping without a matching run
    // (protects against a spoofed scheduleId on a normal chat).
    if ((matched.modifiedCount ?? 0) === 0) {
      return;
    }
    if (params.status === 'requires_action') {
      // Pause surfaces on the card (lastRun) but touches no counters.
      await Schedule().updateOne(
        { id: params.scheduleId },
        {
          $set: {
            lastRun: { conversationId: params.conversationId, status: params.status, firedAt },
          },
        },
      );
      return;
    }
    await applyTerminalBookkeeping({ ...params, firedAt });
    await ScheduleRun().updateOne(
      { scheduleId: params.scheduleId, scheduledFor: params.scheduledFor },
      { $set: { bookkept: true } },
    );
  }

  async function recordSkippedRun(
    data: Partial<IScheduleRun> & {
      scheduleId: string;
      scheduledFor: Date;
      status: Extract<ScheduleRunStatus, 'skipped_overlap' | 'skipped_balance'>;
    },
    balanceSkipDisableThreshold?: number,
  ): Promise<void> {
    const firedAt = new Date();
    const inserted = await insertScheduleRun({ ...data, firedAt });
    if (inserted == null) {
      return;
    }
    // Surface the skip on the card (its chip reads schedule.lastRun). An overlap
    // skip is an intervening non-balance outcome, so it BREAKS the balance-skip
    // streak (the counter is for CONSECUTIVE balance skips).
    await Schedule().updateOne(
      { id: data.scheduleId },
      {
        $set: {
          lastRun: { status: data.status, firedAt },
          ...(data.status !== 'skipped_balance' ? { balanceSkipCount: 0 } : {}),
        },
      },
    );
    if (data.status !== 'skipped_balance' || balanceSkipDisableThreshold == null) {
      return;
    }
    const schedule = await Schedule()
      .findOneAndUpdate({ id: data.scheduleId }, { $inc: { balanceSkipCount: 1 } }, { new: true })
      .lean<ISchedule>();
    if (schedule != null && schedule.balanceSkipCount >= balanceSkipDisableThreshold) {
      await disableSchedule(data.scheduleId, 'insufficient_balance');
    }
  }

  async function setRunFireDetails(
    scheduleId: string,
    scheduledFor: Date,
    details: { conversationId: string; droppedFileIds?: string[] },
  ): Promise<void> {
    await ScheduleRun().updateOne(
      { scheduleId, scheduledFor },
      {
        $set: {
          conversationId: details.conversationId,
          ...(details.droppedFileIds?.length ? { droppedFileIds: details.droppedFileIds } : {}),
        },
      },
    );
  }

  /**
   * Non-terminal runs old enough to need a job-store status check. Fetches
   * `started` (capacity-consuming) and `requires_action` (paused) in separate
   * budgeted, firedAt-ordered buckets so a backlog of long-lived paused rows
   * can't starve orphaned `started` runs out of every sweep.
   */
  async function getRunsForReconciliation(olderThan: Date, limit: number): Promise<IScheduleRun[]> {
    const [started, paused] = await Promise.all([
      ScheduleRun()
        .find({ status: 'started', firedAt: { $lt: olderThan } })
        .sort({ firedAt: 1 })
        .limit(limit)
        .lean<IScheduleRun[]>(),
      ScheduleRun()
        .find({ status: 'requires_action', firedAt: { $lt: olderThan } })
        .sort({ firedAt: 1 })
        .limit(limit)
        .lean<IScheduleRun[]>(),
    ]);
    return [...started, ...paused];
  }

  /** Terminal runs whose schedule bookkeeping never landed (crash between the two writes). */
  async function getUnbookkeptRuns(olderThan: Date, limit: number): Promise<IScheduleRun[]> {
    return ScheduleRun()
      .find({
        status: { $in: ['success', 'error', 'interrupted'] },
        bookkept: false,
        firedAt: { $lt: olderThan },
      })
      .sort({ firedAt: 1 })
      .limit(limit)
      .lean<IScheduleRun[]>();
  }

  /** Re-applies (idempotent) bookkeeping for a terminal run and marks it bookkept. */
  async function finalizeBookkeeping(params: RecordRunOutcomeParams): Promise<void> {
    await applyTerminalBookkeeping({ ...params, firedAt: new Date() });
    await ScheduleRun().updateOne(
      { scheduleId: params.scheduleId, scheduledFor: params.scheduledFor },
      { $set: { bookkept: true } },
    );
  }

  /** Deletes a run row (used to roll back a capacity reservation). */
  async function deleteScheduleRun(scheduleId: string, scheduledFor: Date): Promise<void> {
    await ScheduleRun().deleteOne({ scheduleId, scheduledFor });
  }

  /** Cascade for account deletion: removes a user's schedules and their runs. */
  async function deleteSchedulesByUser(userId: string | Types.ObjectId): Promise<void> {
    const schedules = await Schedule().find({ user: userId }).select('id').lean<{ id: string }[]>();
    const ids = schedules.map((s) => s.id);
    await Schedule().deleteMany({ user: userId });
    if (ids.length > 0) {
      await ScheduleRun().deleteMany({ scheduleId: { $in: ids } });
    }
  }

  async function transitionRunStatus(
    scheduleId: string,
    scheduledFor: Date,
    from: ScheduleRunStatus,
    to: ScheduleRunStatus,
  ): Promise<boolean> {
    const result = await ScheduleRun().updateOne(
      { scheduleId, scheduledFor, status: from },
      { $set: { status: to } },
    );
    return (result.modifiedCount ?? 0) > 0;
  }

  return {
    ensureScheduleIndexes,
    createSchedule,
    updateScheduleById,
    deleteScheduleById,
    getScheduleById,
    getSchedulesByUser,
    countSchedulesByUser,
    countSchedulesAheadOf,
    claimDueSchedule,
    acquireManualRunLease,
    releaseLease,
    advanceSchedule,
    disableSchedule,
    insertScheduleRun,
    setRunFireDetails,
    hasActiveRun,
    countActiveRuns,
    deleteScheduleRun,
    deleteSchedulesByUser,
    getUnbookkeptRuns,
    finalizeBookkeeping,
    recordRunOutcome,
    recordSkippedRun,
    getRunsForReconciliation,
    transitionRunStatus,
  };
}
