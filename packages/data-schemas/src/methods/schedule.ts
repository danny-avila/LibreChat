import type { ScheduleRunStatus, ScheduleDisabledReason } from 'librechat-data-provider';
import type { Model, Types } from 'mongoose';
import type {
  ISchedule,
  IScheduleDocument,
  IScheduleRun,
  IScheduleRunDocument,
} from '~/types/schedule';

const DUPLICATE_KEY = 11000;

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
  claimDueSchedule: (params: ClaimDueScheduleParams) => Promise<ISchedule | null>;
  advanceSchedule: (id: string, nextRunAt: Date | null) => Promise<void>;
  disableSchedule: (id: string, reason: ScheduleDisabledReason) => Promise<void>;
  insertScheduleRun: (data: Partial<IScheduleRun>) => Promise<IScheduleRun | null>;
  setRunFireDetails: (
    scheduleId: string,
    scheduledFor: Date,
    details: { conversationId: string; droppedFileIds?: string[] },
  ) => Promise<void>;
  hasActiveRun: (scheduleId: string) => Promise<boolean>;
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

  /** Terminal (or pause) transition for a run + lastRun/failure bookkeeping. */
  async function recordRunOutcome(params: RecordRunOutcomeParams): Promise<void> {
    const firedAt = new Date();
    await ScheduleRun().updateOne(
      { scheduleId: params.scheduleId, scheduledFor: params.scheduledFor, status: 'started' },
      {
        $set: {
          status: params.status,
          ...(params.conversationId ? { conversationId: params.conversationId } : {}),
          ...(params.error ? { error: params.error } : {}),
          ...(params.durationMs != null ? { durationMs: params.durationMs } : {}),
        },
      },
    );
    if (params.status === 'requires_action') {
      return;
    }
    const isFailure = params.status === 'error';
    const schedule = await Schedule()
      .findOneAndUpdate(
        { id: params.scheduleId },
        {
          $set: {
            lastRun: {
              conversationId: params.conversationId,
              status: params.status,
              error: params.error,
              firedAt,
            },
            ...(isFailure ? {} : { balanceSkipCount: 0 }),
          },
          $inc: isFailure ? { failureCount: 1 } : { runCount: 1 },
          ...(isFailure ? {} : { $unset: { disabledReason: 1 } }),
        },
        { new: true },
      )
      .lean<ISchedule>();
    if (!isFailure && schedule != null && schedule.failureCount > 0) {
      await Schedule().updateOne({ id: params.scheduleId }, { $set: { failureCount: 0 } });
    }
    if (isFailure && schedule != null && schedule.failureCount >= params.autoDisableAfterFailures) {
      await disableSchedule(params.scheduleId, 'too_many_failures');
    }
  }

  async function recordSkippedRun(
    data: Partial<IScheduleRun> & {
      scheduleId: string;
      scheduledFor: Date;
      status: Extract<ScheduleRunStatus, 'skipped_overlap' | 'skipped_balance'>;
    },
    balanceSkipDisableThreshold?: number,
  ): Promise<void> {
    const inserted = await insertScheduleRun({ ...data, firedAt: new Date() });
    if (
      inserted == null ||
      data.status !== 'skipped_balance' ||
      balanceSkipDisableThreshold == null
    ) {
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

  /** Non-terminal runs old enough to need a job-store status check. */
  async function getRunsForReconciliation(olderThan: Date, limit: number): Promise<IScheduleRun[]> {
    return ScheduleRun()
      .find({ status: { $in: ['started', 'requires_action'] }, firedAt: { $lt: olderThan } })
      .limit(limit)
      .lean<IScheduleRun[]>();
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
    createSchedule,
    updateScheduleById,
    deleteScheduleById,
    getScheduleById,
    getSchedulesByUser,
    countSchedulesByUser,
    claimDueSchedule,
    advanceSchedule,
    disableSchedule,
    insertScheduleRun,
    setRunFireDetails,
    hasActiveRun,
    recordRunOutcome,
    recordSkippedRun,
    getRunsForReconciliation,
    transitionRunStatus,
  };
}
