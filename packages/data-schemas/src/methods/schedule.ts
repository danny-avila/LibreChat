import { randomUUID } from 'node:crypto';
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

/** Statuses that occupy a schedule's live capacity / block a concurrent occurrence. */
const ACTIVE_RUN_STATUSES: ScheduleRunStatus[] = ['started', 'requires_action'];

type DuplicateKeyError = { code?: number; keyPattern?: Record<string, unknown> };

/** A duplicate-key error whose conflict is the {scheduleId, scheduledFor} occurrence index. */
function isOccurrenceDuplicate(error: unknown): boolean {
  const err = error as DuplicateKeyError;
  return err?.code === DUPLICATE_KEY && err.keyPattern != null && 'scheduledFor' in err.keyPattern;
}

/** A duplicate-key error whose conflict is the single-active-run partial index
 *  ({scheduleId} where status:'started'). Matched EXACTLY on scheduleId so the
 *  global {capacitySlot} index below is never misread as a per-schedule overlap. */
function isActiveRunConflict(error: unknown): boolean {
  const err = error as DuplicateKeyError;
  return (
    err?.code === DUPLICATE_KEY &&
    err.keyPattern != null &&
    'scheduleId' in err.keyPattern &&
    !('scheduledFor' in err.keyPattern)
  );
}

/** A duplicate-key error whose conflict is the GLOBAL {capacitySlot} cap index. */
function isCapacitySlotConflict(error: unknown): boolean {
  const err = error as DuplicateKeyError;
  return err?.code === DUPLICATE_KEY && err.keyPattern != null && 'capacitySlot' in err.keyPattern;
}

/** A duplicate-key error whose conflict is the per-user {user, slot} cap index. */
function isSlotConflict(error: unknown): boolean {
  const err = error as DuplicateKeyError;
  return err?.code === DUPLICATE_KEY && err.keyPattern != null && 'slot' in err.keyPattern;
}

export interface ClaimDueScheduleParams {
  instanceId: string;
  leaseMs: number;
}

export interface RecordRunOutcomeParams {
  scheduleId: string;
  scheduledFor: Date;
  status: Extract<ScheduleRunStatus, 'success' | 'error' | 'requires_action' | 'interrupted'>;
  conversationId?: string;
  error?: string;
  durationMs?: number;
  autoDisableAfterFailures: number;
  /** The configRevision this run started under. Terminal bookkeeping / auto-disable is
   *  skipped when the owner has since edited the schedule (revision moved on). */
  expectConfigRevision?: number;
}

/** Result of claiming/leasing a schedule: the snapshot plus the fencing token to carry. */
export interface ScheduleClaim {
  schedule: ISchedule;
  claimToken: string;
}

/** Outcome of reserving the single-active-run slot for a fired occurrence. */
export type StartedRunReservation =
  | { run: IScheduleRun }
  | { conflict: 'duplicate' | 'overlap' | 'slot-taken' };

/** Outcome of promoting a paused occurrence back into the single active slot. */
export type PromoteRunResult = 'promoted' | 'overlap' | 'missing';

export type ScheduleMethods = {
  ensureScheduleIndexes: () => Promise<void>;
  createSchedule: (data: Partial<ISchedule>) => Promise<ISchedule>;
  createScheduleWithSlot: (
    data: Partial<ISchedule>,
    maxPerUser: number,
  ) => Promise<ISchedule | 'limit'>;
  updateScheduleById: (
    id: string,
    userId: string | Types.ObjectId,
    update: Partial<ISchedule>,
    unset?: Record<string, 1>,
  ) => Promise<ISchedule | null>;
  deleteScheduleById: (id: string, userId: string | Types.ObjectId) => Promise<boolean>;
  getScheduleById: (id: string, userId?: string | Types.ObjectId) => Promise<ISchedule | null>;
  scheduleExists: (id: string) => Promise<boolean>;
  getSchedulesByUser: (userId: string | Types.ObjectId) => Promise<ISchedule[]>;
  countSchedulesByUser: (userId: string | Types.ObjectId) => Promise<number>;
  claimDueSchedule: (params: ClaimDueScheduleParams) => Promise<ISchedule | null>;
  acquireManualRunLease: (
    id: string,
    userId: string | Types.ObjectId,
    leaseMs: number,
  ) => Promise<ISchedule | null>;
  releaseLease: (id: string, expectedClaimToken?: string) => Promise<void>;
  releaseLeaseByHolder: (id: string, leaseBy: string) => Promise<void>;
  revalidateClaim: (id: string, claimToken: string, requireEnabled?: boolean) => Promise<boolean>;
  holdsLease: (id: string, leaseBy: string) => Promise<boolean>;
  hasOtherActiveRun: (scheduleId: string, scheduledFor: Date) => Promise<boolean>;
  isOccurrenceStarted: (scheduleId: string, scheduledFor: Date) => Promise<boolean>;
  advanceSchedule: (
    id: string,
    nextRunAt: Date | null,
    expectedNextRunAt?: Date | null,
    expectedClaimToken?: string,
  ) => Promise<void>;
  disableSchedule: (
    id: string,
    reason: ScheduleDisabledReason,
    expectedClaimToken?: string,
  ) => Promise<void>;
  insertScheduleRun: (data: Partial<IScheduleRun>) => Promise<IScheduleRun | null>;
  reserveStartedRun: (data: Partial<IScheduleRun>) => Promise<StartedRunReservation>;
  getCapacityOccupancy: () => Promise<{ takenSlots: number[]; unslotted: number }>;
  requestRunAbort: (scheduleId: string, scheduledFor: Date) => Promise<boolean>;
  getRun: (scheduleId: string, scheduledFor: Date) => Promise<IScheduleRun | null>;
  setRunFireDetails: (
    scheduleId: string,
    scheduledFor: Date,
    details: { conversationId: string; droppedFileIds?: string[] },
  ) => Promise<void>;
  hasActiveRun: (scheduleId: string) => Promise<boolean>;
  countActiveRuns: () => Promise<number>;
  deleteScheduleRun: (
    scheduleId: string,
    scheduledFor: Date,
    expectedStatus?: ScheduleRunStatus,
  ) => Promise<void>;
  markScheduleDeleting: (id: string, userId: string | Types.ObjectId) => Promise<ISchedule | null>;
  getActiveRunsForSchedule: (scheduleId: string) => Promise<IScheduleRun[]>;
  getActiveRunsForUser: (userId: string | Types.ObjectId) => Promise<IScheduleRun[]>;
  disableUserSchedulesForDeletion: (userId: string | Types.ObjectId) => Promise<void>;
  getDeletingSchedules: (limit: number) => Promise<ISchedule[]>;
  eraseScheduleIfDrained: (id: string) => Promise<boolean>;
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

  /**
   * Creates a schedule in the lowest free per-user slot, enforcing maxPerUser
   * ATOMICALLY: the {user, slot} partial unique index is the sole arbiter, so
   * concurrent creates that pick the same slot collide (duplicate key) and one
   * retries the next free slot — no read-then-count window, no drift. Returns
   * 'limit' when all slots in [0, maxPerUser) are held by the user's live schedules.
   */
  async function createScheduleWithSlot(
    data: Partial<ISchedule>,
    maxPerUser: number,
  ): Promise<ISchedule | 'limit'> {
    const userId = data.user;
    // Bound the retries by maxPerUser+1: each collision advances to a distinct
    // slot, so a caller can lose at most (slots occupied) races before it either
    // wins a free slot or finds every slot taken.
    for (let attempt = 0; attempt <= maxPerUser; attempt++) {
      const used = await Schedule()
        .find({ user: userId, deleting: { $ne: true } })
        .select('slot')
        .lean<Array<{ slot?: number }>>();
      const taken = new Set(
        used.map((s) => s.slot).filter((s): s is number => typeof s === 'number'),
      );
      if (taken.size >= maxPerUser) {
        return 'limit';
      }
      let slot = 0;
      while (taken.has(slot)) {
        slot++;
      }
      if (slot >= maxPerUser) {
        return 'limit';
      }
      try {
        const doc = await Schedule().create({ ...data, slot, deleting: false });
        return doc.toObject();
      } catch (error) {
        if (isSlotConflict(error)) {
          continue;
        }
        throw error;
      }
    }
    return 'limit';
  }

  /**
   * Owner edit. Rotates `claimToken` on every update so an in-flight engine claim
   * (which captured the prior token) is fenced off: its disable/advance/release
   * writes and its pre-dispatch revalidation no-op, and it cannot fire an edited
   * or re-enabled schedule. Delete removes the row, so those writes no-op too.
   */
  async function updateScheduleById(
    id: string,
    userId: string | Types.ObjectId,
    update: Partial<ISchedule>,
    unset?: Record<string, 1>,
  ): Promise<ISchedule | null> {
    return Schedule()
      .findOneAndUpdate(
        { id, user: userId, deleting: { $ne: true } },
        {
          $set: { ...update, claimToken: randomUUID() },
          // The ONLY writer of configRevision: an owner edit moves the config
          // generation forward atomically with the claim-token rotation, so a run
          // that started under the old config can detect it and skip bookkeeping.
          // Worker/policy writes (claim, lease, advance, disable, bookkeeping) never
          // bump it, and deletion deliberately does not either — a draining run must
          // still be able to record its outcome before erasure.
          $inc: { configRevision: 1 },
          ...(unset ? { $unset: unset } : {}),
        },
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
    const filter: Record<string, unknown> = { id, deleting: { $ne: true } };
    if (userId != null) {
      filter.user = userId;
    }
    return Schedule().findOne(filter).lean<ISchedule>();
  }

  /** Raw existence check, ignoring the `deleting` soft-delete flag. Distinguishes a
   *  HARD-deleted schedule (gone) from a lease takeover (schedule still present). */
  async function scheduleExists(id: string): Promise<boolean> {
    return (await Schedule().exists({ id })) != null;
  }

  async function getSchedulesByUser(userId: string | Types.ObjectId): Promise<ISchedule[]> {
    // Hide schedules pending erasure (soft-deleted, draining their active runs)
    // so a deleted schedule disappears immediately for the owner.
    return Schedule()
      .find({ user: userId, deleting: { $ne: true } })
      .sort({ updatedAt: -1 })
      .select('-leaseUntil -leaseBy -claimToken')
      .lean<ISchedule[]>();
  }

  async function countSchedulesByUser(userId: string | Types.ObjectId): Promise<number> {
    return Schedule().countDocuments({ user: userId, deleting: { $ne: true } });
  }

  /**
   * Atomically claims one due schedule by taking a lease. The per-document CAS
   * is the sole multi-instance dispatch arbiter: exactly one caller wins each
   * due schedule regardless of replica count, with or without Redis. Stamps a
   * fresh `claimToken` the winner carries through every subsequent write.
   */
  async function claimDueSchedule(params: ClaimDueScheduleParams): Promise<ISchedule | null> {
    // Compare due-ness and lease expiry against MongoDB's own clock (`$$NOW`), not
    // each worker's process clock: all replicas race on the persisted nextRunAt /
    // leaseUntil, so a skewed worker must not claim future occurrences early or set
    // a mis-timed lease. `nextRunAt` existence is gated by the plain filter (a bare
    // $expr $lte would match a missing field as null); a missing leaseUntil is
    // treated as epoch so it's always claimable.
    const claimToken = randomUUID();
    return Schedule()
      .findOneAndUpdate(
        {
          enabled: true,
          deleting: { $ne: true },
          nextRunAt: { $exists: true, $ne: null },
          $expr: {
            $and: [
              { $lte: ['$nextRunAt', '$$NOW'] },
              { $lt: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] },
            ],
          },
        },
        [
          {
            $set: {
              leaseUntil: { $add: ['$$NOW', params.leaseMs] },
              leaseBy: params.instanceId,
              claimToken,
            },
          },
        ],
        { new: true, sort: { nextRunAt: 1 } },
      )
      .lean<ISchedule>();
  }

  /**
   * Takes the schedule's lease for a manual run-now, serializing concurrent
   * `POST /:id/run` requests (and blocking against an engine claim) so a
   * double-click can't start two runs. Owner-scoped. Returns the FRESH schedule row
   * (post-image, with the new claim token) so the caller fires the current snapshot
   * — an edit that committed after the route read the schedule but before this lease
   * is reflected here, not the stale pre-edit prompt/agent. Null if already leased.
   */
  async function acquireManualRunLease(
    id: string,
    userId: string | Types.ObjectId,
    leaseMs: number,
  ): Promise<ISchedule | null> {
    // Compare/expire the lease against Mongo's `$$NOW` (same CAS shape as
    // claimDueSchedule), not this worker's clock: a skewed replica must not read a
    // Mongo-written automatic-fire lease as expired early and start a second run.
    const claimToken = randomUUID();
    // A UNIQUE per-lease holder (not the constant 'manual'): the superseded-fire
    // cleanup releases by holder (leaseBy), so a stale run-now that stalled past its
    // lease must not match — and strip — the fresh lease a newer run-now acquired.
    // The claimToken already fences the lease, so reuse it as the holder discriminator.
    const leaseBy = `manual:${claimToken}`;
    return Schedule()
      .findOneAndUpdate(
        {
          id,
          user: userId,
          deleting: { $ne: true },
          $expr: { $lt: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] },
        },
        [{ $set: { leaseUntil: { $add: ['$$NOW', leaseMs] }, leaseBy, claimToken } }],
        { new: true },
      )
      .lean<ISchedule>();
  }

  /**
   * Releases a lease WITHOUT advancing nextRunAt (manual runs never reschedule).
   * Fenced on the claim token when provided so a stale worker cannot strip a lease
   * a different claimer now holds.
   */
  async function releaseLease(id: string, expectedClaimToken?: string): Promise<void> {
    const filter: Record<string, unknown> = { id };
    if (expectedClaimToken !== undefined) {
      filter.claimToken = expectedClaimToken;
    }
    await Schedule().updateOne(filter, { $unset: { leaseUntil: 1, leaseBy: 1 } });
  }

  /**
   * Releases a lease fenced on the lease HOLDER (`leaseBy`) rather than the claim
   * token. Used when a fire is superseded by an owner edit that rotated the token
   * (so a token-fenced release would no-op): the worker still owns the lease, so it
   * must clear it — otherwise the edited schedule (and Run now) is reported "already
   * in progress" until the lease TTL, even though no run was dispatched. A takeover
   * changed `leaseBy`, so this correctly no-ops and never strips the new holder's lease.
   */
  async function releaseLeaseByHolder(id: string, leaseBy: string): Promise<void> {
    await Schedule().updateOne({ id, leaseBy }, { $unset: { leaseUntil: 1, leaseBy: 1 } });
  }

  /**
   * Whether the caller still holds an authoritative claim on the schedule: it is
   * not being deleted, its claim token is unchanged, and its lease has not expired
   * (Mongo `$$NOW`). Called as the last check before the loopback POST so an owner
   * delete/edit or a lease-expiry re-claim between claim and fire aborts the fire
   * instead of dispatching a stale occurrence. `requireEnabled` additionally checks
   * `enabled` (automatic fires must stop once disabled); a manual run-now passes
   * false since the user explicitly triggered it, but delete/edit still fence it.
   */
  async function revalidateClaim(
    id: string,
    claimToken: string,
    requireEnabled = true,
  ): Promise<boolean> {
    const row = await Schedule()
      .findOne({
        id,
        claimToken,
        deleting: { $ne: true },
        ...(requireEnabled ? { enabled: true } : {}),
        $expr: { $gt: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] },
      })
      .select('_id')
      .lean();
    return row != null;
  }

  /**
   * Whether this worker STILL owns the lease it took (same `leaseBy` holder, lease
   * unexpired). Fences a rollback delete of a reserved run row against a lease
   * TAKEOVER while NOT skipping it on an owner edit: a takeover changes `leaseBy`
   * (another worker re-claimed and may have advanced past the occurrence — deleting
   * would erase the only evidence, so leave it for the reconciler), whereas an owner
   * edit only rotates `claimToken` and leaves `leaseBy` intact, so the worker still
   * owns the lease and should delete its own unposted reservation.
   */
  async function holdsLease(id: string, leaseBy: string): Promise<boolean> {
    const row = await Schedule()
      .findOne({
        id,
        leaseBy,
        $expr: { $gt: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] },
      })
      .select('_id')
      .lean();
    return row != null;
  }

  /**
   * Whether a DIFFERENT occurrence of the schedule is currently `started`. Used by
   * the HITL resume overlap check so a paused run whose own row is still `started`
   * (e.g. its pause bookkeeping failed transiently) is not mistaken for an overlap
   * with itself — only a truly concurrent occurrence blocks the resume.
   */
  async function hasOtherActiveRun(scheduleId: string, scheduledFor: Date): Promise<boolean> {
    const row = await ScheduleRun()
      .findOne({ scheduleId, status: 'started', scheduledFor: { $ne: scheduledFor } })
      .select('_id')
      .lean();
    return row != null;
  }

  /**
   * Whether THIS occurrence's own run row is already `started`. Lets the HITL resume
   * capacity gate discount a self-active row (e.g. one whose pause bookkeeping failed
   * transiently): resuming it adds no new active run, so it must not be blocked by a
   * global count that already includes it.
   */
  async function isOccurrenceStarted(scheduleId: string, scheduledFor: Date): Promise<boolean> {
    const row = await ScheduleRun()
      .findOne({ scheduleId, scheduledFor, status: 'started' })
      .select('_id')
      .lean();
    return row != null;
  }

  /**
   * Advances past a fired (or skipped) occurrence and releases the lease. When
   * `expectedNextRunAt` is given, the update is predicated on the schedule still
   * sitting on the claimed occurrence; when `expectedClaimToken` is given it is
   * additionally fenced on the claim, so a stale worker (whose lease expired and
   * was re-claimed, or whose schedule the owner edited) cannot clobber a newer
   * claimer's nextRunAt/lease. A predicate miss simply no-ops the stale write.
   */
  async function advanceSchedule(
    id: string,
    nextRunAt: Date | null,
    expectedNextRunAt?: Date | null,
    expectedClaimToken?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = { id };
    if (expectedNextRunAt !== undefined) {
      filter.nextRunAt = expectedNextRunAt;
    }
    if (expectedClaimToken !== undefined) {
      filter.claimToken = expectedClaimToken;
    }
    await Schedule().updateOne(filter, {
      $set: { ...(nextRunAt ? { nextRunAt } : {}) },
      $unset: { leaseUntil: 1, leaseBy: 1, ...(nextRunAt ? {} : { nextRunAt: 1 }) },
    });
  }

  /**
   * Disables a schedule. Preflight disables from the leased worker pass their
   * `expectedClaimToken` so a stale worker cannot flip a schedule the owner just
   * re-enabled/edited (rotating the token) back to disabled or clear a newer
   * claimer's lease. Policy disables (auto-disable, account quiesce) pass none.
   */
  async function disableSchedule(
    id: string,
    reason: ScheduleDisabledReason,
    expectedClaimToken?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = { id };
    if (expectedClaimToken !== undefined) {
      filter.claimToken = expectedClaimToken;
    }
    await Schedule().updateOne(filter, {
      $set: { enabled: false, disabledReason: reason },
      $unset: { leaseUntil: 1, leaseBy: 1 },
    });
  }

  /**
   * Inserts the run row BEFORE firing. The unique {scheduleId, scheduledFor}
   * index makes this the durable idempotency claim: null means this occurrence
   * was already fired (or is in flight) by another claimer or a prior life.
   * Used for non-`started` rows (skips); started rows go through reserveStartedRun.
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

  /**
   * Reserves the single active-run slot for a fired occurrence by inserting a
   * `started` run. Two distinct duplicate-key outcomes: the {scheduleId,
   * scheduledFor} index means this occurrence already fired ('duplicate'); the
   * single-active partial index means another occurrence of the same schedule is
   * already active ('overlap'). The DB enforces both atomically — no read-then-insert.
   */
  async function reserveStartedRun(data: Partial<IScheduleRun>): Promise<StartedRunReservation> {
    try {
      const doc = await ScheduleRun().create({ ...data, status: 'started' });
      return { run: doc.toObject() };
    } catch (error) {
      if (isOccurrenceDuplicate(error)) {
        return { conflict: 'duplicate' };
      }
      // Checked BEFORE overlap: the global cap index and the per-schedule active
      // index are different failures and drive different caller behavior (retry the
      // next slot vs skip the occurrence).
      if (isCapacitySlotConflict(error)) {
        return { conflict: 'slot-taken' };
      }
      if (isActiveRunConflict(error)) {
        return { conflict: 'overlap' };
      }
      throw error;
    }
  }

  /** Capacity-slot occupancy for the allocator: which slots are held by `started`
   *  runs, plus how many legacy rows hold no slot (they shrink the effective cap so
   *  the bound stays conservative during rollout rather than transiently overshooting). */
  async function getCapacityOccupancy(): Promise<{ takenSlots: number[]; unslotted: number }> {
    const rows = await ScheduleRun()
      .find({ status: 'started' })
      .select('capacitySlot')
      .lean<Array<{ capacitySlot?: number }>>();
    const takenSlots: number[] = [];
    let unslotted = 0;
    for (const row of rows) {
      if (typeof row.capacitySlot === 'number') {
        takenSlots.push(row.capacitySlot);
      } else {
        unslotted += 1;
      }
    }
    return { takenSlots, unslotted };
  }

  /** Records that an abort was requested WITHOUT freeing the capacity slot: the run
   *  keeps counting against fireConcurrency until its generation owner confirms
   *  settlement by writing a terminal outcome. */
  async function requestRunAbort(scheduleId: string, scheduledFor: Date): Promise<boolean> {
    const result = await ScheduleRun().updateOne(
      { scheduleId, scheduledFor, status: { $in: ACTIVE_RUN_STATUSES } },
      [{ $set: { abortRequestedAt: { $ifNull: ['$abortRequestedAt', '$$NOW'] } } }],
    );
    return (result.matchedCount ?? 0) > 0;
  }

  /** The occurrence's run row, or null. Used to read the revision/epoch a run
   *  started under before writing its outcome. */
  async function getRun(scheduleId: string, scheduledFor: Date): Promise<IScheduleRun | null> {
    return ScheduleRun().findOne({ scheduleId, scheduledFor }).lean<IScheduleRun>();
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
    // CONFIG-REVISION FENCE: a run that started under an older owner config must not
    // apply counters (or walk toward auto-disable) against a schedule the owner has
    // since edited or re-enabled. Absent on either side disables the fence, so
    // pre-existing rows/schedules keep today's behavior instead of wedging.
    const revisionFilter =
      params.expectConfigRevision != null ? { configRevision: params.expectConfigRevision } : {};
    await Schedule().updateOne(
      { id: params.scheduleId, countedFor: { $ne: params.scheduledFor }, ...revisionFilter },
      {
        $set: {
          lastRun,
          balanceSkipCount: 0,
          ...(isSuccess ? { failureCount: 0 } : {}),
        },
        $push: { countedFor: { $each: [params.scheduledFor], $slice: -COUNTED_FOR_WINDOW } },
        ...(isSuccess ? { $inc: { runCount: 1 } } : {}),
        ...(isFailure ? { $inc: { failureCount: 1 } } : {}),
      },
    );
    // A success clears a transient disable reason ONLY while the schedule is still
    // enabled. An older run (e.g. a resumed pause) can succeed AFTER newer outcomes
    // already auto-disabled the schedule — since `requires_action` runs don't block
    // later occurrences — and must not wipe the reason that explains why it's off.
    // Predicated on `enabled` separately so it can't leak into the count-guarded
    // update above (which must run regardless of enabled state).
    if (isSuccess) {
      await Schedule().updateOne(
        { id: params.scheduleId, enabled: true },
        { $unset: { disabledReason: 1 } },
      );
    }
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
    if (params.status === 'requires_action') {
      // PAUSE (HITL): write the card BEFORE flipping the run row so the transition is
      // crash-recoverable. If the process dies between the two writes the row is still
      // `started`, and the reconciler's started+requires_action path re-invokes this to
      // re-surface the pause; flipping the row first (as terminal outcomes do) would
      // instead hide the pause from the card until some later terminal outcome. Guard on
      // a matching active run first so a spoofed scheduleId can't write a card. Keyed on
      // existence, not modification, so a retried pause still re-affirms the card.
      const activeRun = await ScheduleRun()
        .findOne({
          scheduleId: params.scheduleId,
          scheduledFor: params.scheduledFor,
          status: { $in: ['started', 'requires_action'] },
        })
        .select('_id')
        .lean();
      if (activeRun == null) {
        return;
      }
      await Schedule().updateOne(
        { id: params.scheduleId },
        {
          $set: {
            lastRun: { conversationId: params.conversationId, status: params.status, firedAt },
          },
        },
      );
      await ScheduleRun().updateOne(
        {
          scheduleId: params.scheduleId,
          scheduledFor: params.scheduledFor,
          status: { $in: ['started', 'requires_action'] },
        },
        {
          $set: {
            status: 'requires_action',
            ...(params.conversationId ? { conversationId: params.conversationId } : {}),
          },
          // Leaving `started` frees the global capacity slot; the resume claims a
          // fresh one from the allocator rather than re-adopting a possibly-taken slot.
          $unset: { capacitySlot: 1 },
        },
      );
      return;
    }
    // TERMINAL: flip the run row (match-guarded), then apply bookkeeping. `bookkept` is
    // set false at the flip and true only after bookkeeping lands, so a crash between is
    // re-applied by the reconciler (getUnbookkeptRuns) while countedFor keeps counters idempotent.
    const matched = await ScheduleRun().updateOne(
      {
        scheduleId: params.scheduleId,
        scheduledFor: params.scheduledFor,
        status: { $in: ['started', 'requires_action'] },
      },
      {
        $set: {
          status: params.status,
          bookkept: false,
          ...(params.conversationId ? { conversationId: params.conversationId } : {}),
          ...(params.error ? { error: params.error } : {}),
          ...(params.durationMs != null ? { durationMs: params.durationMs } : {}),
        },
        // SETTLEMENT: a terminal outcome is the generation owner confirming the run
        // actually stopped, so this is the ONLY place the global capacity slot is
        // released. An abort request alone does not free it (see requestRunAbort).
        // Any in-flight resume lease ends with the run.
        $unset: { capacitySlot: 1 },
      },
    );
    // No-match guard: never touch schedule bookkeeping without a matching run
    // (protects against a spoofed scheduleId on a normal chat).
    if ((matched.matchedCount ?? 0) === 0) {
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
    // A duplicate {scheduleId, scheduledFor} row means a prior attempt inserted it.
    // Proceed as a retry ONLY when that row is the SAME skip — otherwise this claim
    // is a retry of an occurrence that actually started/terminalized (e.g. the POST
    // was accepted but advanceSchedule failed before releasing the lease), and
    // rewriting lastRun/counters would mislabel a real run as a skip (and could
    // walk it toward auto-disable). The streak $inc is separately guarded per
    // occurrence by `countedFor`, so a genuine same-skip retry can't double-count.
    const inserted = await insertScheduleRun({ ...data, firedAt });
    if (inserted == null) {
      const existing = await ScheduleRun()
        .findOne({ scheduleId: data.scheduleId, scheduledFor: data.scheduledFor })
        .select('status')
        .lean<{ status?: ScheduleRunStatus }>();
      if (existing == null || existing.status !== data.status) {
        return;
      }
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
    // Per-occurrence guard: increment the consecutive-balance-skip streak at most
    // once for this occurrence even across crash retries (same `countedFor` set the
    // terminal counters use; an occurrence is only ever skipped OR fired, never both).
    const schedule = await Schedule()
      .findOneAndUpdate(
        { id: data.scheduleId, countedFor: { $ne: data.scheduledFor } },
        {
          $inc: { balanceSkipCount: 1 },
          $push: { countedFor: { $each: [data.scheduledFor], $slice: -COUNTED_FOR_WINDOW } },
        },
        { new: true },
      )
      .lean<ISchedule>();
    // Auto-disable is a POLICY re-evaluated on EVERY call (idempotent), NOT gated on
    // the count guard — mirroring applyTerminalBookkeeping. If a crash landed the
    // $inc/$push but not the disable, the guarded update above no-ops to null on the
    // replay, so re-read the current counter and still disable when at/over threshold.
    const current =
      schedule ?? (await Schedule().findOne({ id: data.scheduleId }).lean<ISchedule>());
    if (current?.enabled && current.balanceSkipCount >= balanceSkipDisableThreshold) {
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

  /**
   * Deletes a run row (used to roll back a capacity reservation). Status-fenced
   * when `expectedStatus` is provided so a rollback cannot delete a row a
   * concurrent process already advanced (e.g. to a terminal outcome).
   */
  async function deleteScheduleRun(
    scheduleId: string,
    scheduledFor: Date,
    expectedStatus?: ScheduleRunStatus,
  ): Promise<void> {
    const filter: Record<string, unknown> = { scheduleId, scheduledFor };
    if (expectedStatus !== undefined) {
      filter.status = expectedStatus;
    }
    await ScheduleRun().deleteOne(filter);
  }

  /**
   * Soft-deletes a schedule for the owner: disables it (so the engine can no
   * longer claim it), rotates the claim token (fencing any in-flight worker), and
   * marks it `deleting` so it is hidden and awaits erasure once its active runs
   * drain. Returns the updated row (for aborting its in-flight jobs) or null.
   */
  async function markScheduleDeleting(
    id: string,
    userId: string | Types.ObjectId,
  ): Promise<ISchedule | null> {
    // Keep leaseUntil/leaseBy: a fire that already leased/reserved this occurrence
    // must be able to prove (holdsLease) it still owns the lease so it can roll back
    // its own unposted `started` row on the superseded revalidation. Unsetting the
    // lease here would fail that check and strand a ghost `started` row. Only clear
    // nextRunAt (belt-and-suspenders atop enabled:false to stop new claims); the
    // lease releases itself when the fire finishes its rollback, or via TTL.
    return Schedule()
      .findOneAndUpdate(
        { id, user: userId, deleting: { $ne: true } },
        {
          $set: { enabled: false, deleting: true, claimToken: randomUUID() },
          $unset: { nextRunAt: 1 },
        },
        { new: true },
      )
      .lean<ISchedule>();
  }

  /** In-flight (non-terminal) runs of a schedule — the jobs a delete must abort. */
  async function getActiveRunsForSchedule(scheduleId: string): Promise<IScheduleRun[]> {
    return ScheduleRun()
      .find({ scheduleId, status: { $in: ACTIVE_RUN_STATUSES } })
      .lean<IScheduleRun[]>();
  }

  /** In-flight runs across all of a user's schedules — for account-deletion quiescing. */
  async function getActiveRunsForUser(userId: string | Types.ObjectId): Promise<IScheduleRun[]> {
    return ScheduleRun()
      .find({ user: userId, status: { $in: ACTIVE_RUN_STATUSES } })
      .lean<IScheduleRun[]>();
  }

  /**
   * Marks all of a user's schedules non-claimable ahead of account deletion, so
   * the engine cannot fire a new occurrence while the cascade runs. Rotates each
   * claim token to fence any in-flight worker.
   */
  async function disableUserSchedulesForDeletion(userId: string | Types.ObjectId): Promise<void> {
    await Schedule().updateMany(
      { user: userId, deleting: { $ne: true } },
      {
        $set: { enabled: false, deleting: true, claimToken: randomUUID() },
        $unset: { nextRunAt: 1 },
      },
    );
  }

  /** Soft-deleted schedules awaiting erasure (drained of active runs). */
  async function getDeletingSchedules(limit: number): Promise<ISchedule[]> {
    return Schedule().find({ deleting: true }).limit(limit).lean<ISchedule[]>();
  }

  /**
   * Erases a soft-deleted schedule and its runs ONLY once it has fully drained, so a
   * live loopback generation's evidence is never destroyed out from under it. Drained
   * means BOTH: (a) no run is active, and (b) no LIVE lease is held. The lease check
   * is essential — a worker can have CLAIMED the schedule but not yet inserted its
   * `started` reservation (or be mid-rollback of one); erasing in that window would
   * let the worker then insert a ghost row against a gone schedule that it can no
   * longer prove it owns. Returns whether it erased.
   */
  async function eraseScheduleIfDrained(id: string): Promise<boolean> {
    // A live lease (leaseUntil > $$NOW) means a worker still holds the claim.
    const leased = await Schedule()
      .findOne({
        id,
        deleting: true,
        $expr: { $gt: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] },
      })
      .select('_id')
      .lean();
    if (leased != null) {
      return false;
    }
    const active = await ScheduleRun()
      .findOne({ scheduleId: id, status: { $in: ACTIVE_RUN_STATUSES } })
      .select('_id')
      .lean();
    if (active != null) {
      return false;
    }
    await ScheduleRun().deleteMany({ scheduleId: id });
    await Schedule().deleteOne({ id, deleting: true });
    return true;
  }

  /** Cascade for account deletion: removes a user's schedules and their runs. */
  async function deleteSchedulesByUser(userId: string | Types.ObjectId): Promise<void> {
    // Delete RUNS before SCHEDULES so a partial failure is retryable: both are
    // user-scoped and idempotent, so a crash after the runs delete leaves the
    // schedules for a retry to re-delete (deleting schedules first would orphan the
    // runs — a re-run finds no schedules and never removes the leftover run rows).
    await ScheduleRun().deleteMany({ user: userId });
    await Schedule().deleteMany({ user: userId });
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
    createScheduleWithSlot,
    updateScheduleById,
    deleteScheduleById,
    getScheduleById,
    scheduleExists,
    getSchedulesByUser,
    countSchedulesByUser,
    claimDueSchedule,
    acquireManualRunLease,
    releaseLease,
    releaseLeaseByHolder,
    revalidateClaim,
    holdsLease,
    hasOtherActiveRun,
    isOccurrenceStarted,
    advanceSchedule,
    disableSchedule,
    insertScheduleRun,
    reserveStartedRun,
    getCapacityOccupancy,
    requestRunAbort,
    getRun,
    setRunFireDetails,
    hasActiveRun,
    countActiveRuns,
    deleteScheduleRun,
    markScheduleDeleting,
    getActiveRunsForSchedule,
    getActiveRunsForUser,
    disableUserSchedulesForDeletion,
    getDeletingSchedules,
    eraseScheduleIfDrained,
    deleteSchedulesByUser,
    getUnbookkeptRuns,
    finalizeBookkeeping,
    recordRunOutcome,
    recordSkippedRun,
    getRunsForReconciliation,
    transitionRunStatus,
  };
}
