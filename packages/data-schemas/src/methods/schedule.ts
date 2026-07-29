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

/** Card statuses that represent a SETTLED occurrence — everything except the pause. */
const TERMINAL_CARD_STATUSES: ScheduleRunStatus[] = [
  'success',
  'error',
  'interrupted',
  'skipped_overlap',
  'skipped_balance',
];

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

/** A duplicate-key error whose conflict is the per-user create-idempotency index. */
function isClientRequestConflict(error: unknown): boolean {
  const err = error as DuplicateKeyError;
  return (
    err?.code === DUPLICATE_KEY && err.keyPattern != null && 'clientRequestId' in err.keyPattern
  );
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
}

/** Result of claiming/leasing a schedule: the snapshot plus the fencing token to carry. */
export interface ScheduleClaim {
  schedule: ISchedule;
  claimToken: string;
}

/** Outcome of reserving the single-active-run slot for a fired occurrence. */
export type StartedRunReservation =
  | { run: IScheduleRun }
  | {
      conflict: 'duplicate' | 'overlap' | 'slot-taken';
      /** For a `duplicate`, the status of the row that already holds this occurrence.
       *  A TERMINAL status means the occurrence is finished and merely never advanced
       *  past; an active one means another worker is still running it. */
      existingStatus?: ScheduleRunStatus;
    };

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
    options?: { expectedConfigRevision?: number },
  ) => Promise<ISchedule | null>;
  deleteScheduleById: (id: string, userId: string | Types.ObjectId) => Promise<boolean>;
  getScheduleById: (id: string, userId?: string | Types.ObjectId) => Promise<ISchedule | null>;
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
    expectedConfigRevision?: number,
    /** Extra filter pinning the counter the disable DECISION was made on, so a
     *  concurrent outcome that reset the streak invalidates this stale write. */
    counterGuard?: Record<string, unknown>,
  ) => Promise<void>;
  insertScheduleRun: (data: Partial<IScheduleRun>) => Promise<IScheduleRun | null>;
  reserveStartedRun: (data: Partial<IScheduleRun>) => Promise<StartedRunReservation>;
  getCapacityOccupancy: () => Promise<{ takenSlots: number[]; unslotted: number }>;
  requestRunAbort: (scheduleId: string, scheduledFor: Date) => Promise<boolean>;
  setRunFireDetails: (
    scheduleId: string,
    scheduledFor: Date,
    details: { conversationId: string; droppedFileIds?: string[] },
  ) => Promise<void>;
  countActiveRuns: () => Promise<number>;
  deleteScheduleRun: (
    scheduleId: string,
    scheduledFor: Date,
    expectedStatus?: ScheduleRunStatus,
    expectedConversationId?: string,
  ) => Promise<void>;
  markScheduleDeleting: (id: string, userId: string | Types.ObjectId) => Promise<ISchedule | null>;
  getActiveRunsForSchedule: (scheduleId: string) => Promise<IScheduleRun[]>;
  getActiveRunsForUser: (userId: string | Types.ObjectId) => Promise<IScheduleRun[]>;
  disableUserSchedulesForDeletion: (userId: string | Types.ObjectId) => Promise<void>;
  getDeletingSchedules: (limit: number) => Promise<ISchedule[]>;
  getDeletingScheduleIds: (userId: string | Types.ObjectId, limit: number) => Promise<string[]>;
  getUnarmedSchedules: (limit: number) => Promise<ISchedule[]>;
  armSchedule: (id: string, nextRunAt: Date) => Promise<void>;
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
  markRunsReconciled: (runs: Array<Pick<IScheduleRun, '_id'>>) => Promise<void>;
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
        // A RETRY of a create whose first attempt already committed. Hand back the
        // original row so the caller re-arms and reports that one, instead of minting a
        // second recurring schedule for a single user intent.
        if (isClientRequestConflict(error) && data.clientRequestId) {
          const existing = await Schedule()
            .findOne({ user: userId, clientRequestId: data.clientRequestId })
            .lean<ISchedule>();
          if (existing != null) {
            return existing;
          }
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
    /** Optional edit-generation fence, so two overlapping owner edits cannot each
     *  persist state derived from a row the other has already replaced. */
    options?: { expectedConfigRevision?: number },
  ): Promise<ISchedule | null> {
    return Schedule()
      .findOneAndUpdate(
        {
          id,
          user: userId,
          deleting: { $ne: true },
          ...(options?.expectedConfigRevision !== undefined
            ? { configRevision: options.expectedConfigRevision }
            : {}),
        },
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
   * claimer's lease. POLICY disables (auto-disable) instead pass the config
   * generation of the RUN that tripped the threshold: the counter update they follow
   * is revision-fenced, so leaving the disable itself unfenced let a stale run (or a
   * reconciler replay of one) disable a schedule the owner had since edited and
   * re-enabled. Absent on either side disables the fence.
   */
  async function disableSchedule(
    id: string,
    reason: ScheduleDisabledReason,
    expectedClaimToken?: string,
    expectedConfigRevision?: number,
    counterGuard?: Record<string, unknown>,
  ): Promise<void> {
    const filter: Record<string, unknown> = { id, ...counterGuard };
    if (expectedClaimToken !== undefined) {
      filter.claimToken = expectedClaimToken;
    }
    if (expectedConfigRevision !== undefined) {
      filter.configRevision = expectedConfigRevision;
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
        // Report the EXISTING row's status. A duplicate means another fire owns this
        // occurrence — but "owns" and "already finished" need opposite handling, and the
        // caller cannot distinguish them without this.
        const existing = await ScheduleRun()
          .findOne({ scheduleId: data.scheduleId, scheduledFor: data.scheduledFor })
          .select('status')
          .lean<Pick<IScheduleRun, 'status'>>();
        return { conflict: 'duplicate', existingStatus: existing?.status };
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

  /** Count of in-flight scheduled runs (across all schedules) for the fire cap. */
  async function countActiveRuns(): Promise<number> {
    return ScheduleRun().countDocuments({ status: 'started' });
  }

  /**
   * Writes an occurrence's result onto the schedule card, fenced on occurrence order
   * so a delayed outcome can never overwrite a NEWER occurrence's projection. The
   * fence is absent-tolerant: rows written before `lastRun.scheduledFor` existed
   * project once and then start ordering normally.
   */
  async function projectLastRun(
    scheduleId: string,
    lastRun: NonNullable<ISchedule['lastRun']>,
    scheduledFor: Date,
    revisionFilter: Record<string, unknown> = {},
  ): Promise<void> {
    // A PAUSE is the only non-terminal projection, and it is the one that can still
    // arrive late for its own occurrence: the row transition is won first, and a resume
    // can terminalize and project between that CAS and this write. Occurrence ordering
    // alone permits it (same `scheduledFor`), so refuse to walk this occurrence's card
    // backwards from a settled result to "Needs approval" — which nothing would correct
    // until the next occurrence ran.
    const notAlreadySettled =
      lastRun.status === 'requires_action'
        ? {
            $nor: [
              {
                $and: [
                  { 'lastRun.scheduledFor': scheduledFor },
                  { 'lastRun.status': { $in: TERMINAL_CARD_STATUSES } },
                ],
              },
            ],
          }
        : {};
    await Schedule().updateOne(
      {
        id: scheduleId,
        $or: [
          { 'lastRun.scheduledFor': { $exists: false } },
          { 'lastRun.scheduledFor': { $lte: scheduledFor } },
        ],
        ...notAlreadySettled,
        ...revisionFilter,
      },
      { $set: { lastRun: { ...lastRun, scheduledFor } } },
    );
  }

  /**
   * Applies the schedule-side bookkeeping (lastRun + counters + auto-disable) for
   * a terminal occurrence. Idempotent via the per-occurrence `countedFor` guard:
   * the $inc lands at most once per occurrence no matter how many times it is
   * retried (inline finish, reconciler catch of an un-`bookkept` run, crash-replay),
   * even when a later occurrence's counting interleaves with an earlier paused one.
   */
  async function applyTerminalBookkeeping(
    params: RecordRunOutcomeParams & { firedAt: Date; expectConfigRevision?: number },
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
    // ORDER FENCE, the same one the card projection has always had. `failureCount` and
    // `balanceSkipCount` are CONSECUTIVE streaks, so they are order-sensitive in a way
    // per-occurrence idempotency (`countedFor`) cannot express: a `requires_action` run
    // does not block later occurrences, so an older occurrence — a resumed pause, a
    // reconciler replay — routinely settles AFTER a newer one. Unfenced, its late `error`
    // rebuilds a streak a newer success had already cleared, and since
    // `autoDisableAfterFailures` may be configured as low as 1, a single stale failure
    // can disable a healthy schedule.
    //
    // The fence covers the WHOLE counter update rather than the streak fields alone:
    // splitting it would break the atomicity that keeps a crash from half-applying the
    // count, and DocumentDB rules out expressing it as a pipeline update. The cost is
    // that a late occurrence's success does not add to `runCount` — a display total
    // under-counting a rare out-of-order run, which is the cheap side of this trade.
    // Absent-tolerant, so schedules written before the watermark existed count once and
    // then order normally.
    const counterOrderFilter = {
      $or: [{ countersAsOf: { $exists: false } }, { countersAsOf: { $lte: params.scheduledFor } }],
    };
    await Schedule().updateOne(
      {
        id: params.scheduleId,
        countedFor: { $ne: params.scheduledFor },
        ...revisionFilter,
        ...counterOrderFilter,
      },
      {
        $set: {
          balanceSkipCount: 0,
          countersAsOf: params.scheduledFor,
          ...(isSuccess ? { failureCount: 0 } : {}),
        },
        $push: { countedFor: { $each: [params.scheduledFor], $slice: -COUNTED_FOR_WINDOW } },
        ...(isSuccess ? { $inc: { runCount: 1 } } : {}),
        ...(isFailure ? { $inc: { failureCount: 1 } } : {}),
      },
    );
    // The card projection is ORDER-fenced, unlike the counters above (idempotent and
    // order-insensitive): a `requires_action` run doesn't block later occurrences, so a
    // resumed pause — or a reconciler replay — routinely settles AFTER a newer run
    // already finished, and must not roll the card back to its older result.
    await projectLastRun(params.scheduleId, lastRun, params.scheduledFor, revisionFilter);
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
        // Carry the COUNT this decision was made on, not just the revision. The read
        // above and this write are separate statements, and a concurrent success resets
        // the failure streak to zero — a revision-only fence would still let this stale
        // decision disable a schedule whose streak had just been cleared.
        await disableSchedule(
          params.scheduleId,
          'too_many_failures',
          undefined,
          params.expectConfigRevision,
          { failureCount: { $gte: params.autoDisableAfterFailures } },
        );
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
      // PAUSE (HITL): win the ROW transition first, then project the card. A read-then-
      // write guard let a concurrent resume terminalize the run between the two, after
      // which the card was pinned to "Needs approval" forever — the row update no-op'd
      // (already terminal) while the card write had landed. Matching `requires_action`
      // too keeps a retried pause re-affirming the card, and keeps the transition
      // crash-recoverable: the reconciler re-invokes this for a row in either state.
      // The match is also the anti-spoof guard a bare scheduleId would bypass.
      const paused = await ScheduleRun().findOneAndUpdate(
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
        { new: false },
      );
      if (paused == null) {
        return;
      }
      // Revision-fenced like the terminal path: an owner edit landing between the fire
      // and the approval must not have the OLD config's pause stamped on it. Without
      // this the later terminal write (which IS fenced) could never replace the stale
      // status, so the card stuck on "Needs approval".
      await projectLastRun(
        params.scheduleId,
        { conversationId: params.conversationId, status: params.status, firedAt },
        params.scheduledFor,
        paused.configRevision != null ? { configRevision: paused.configRevision } : {},
      );
      return;
    }
    // TERMINAL: flip the run row (match-guarded), then apply bookkeeping. `bookkept` is
    // set false at the flip and true only after bookkeeping lands, so a crash between is
    // re-applied by the reconciler (getUnbookkeptRuns) while countedFor keeps counters idempotent.
    const settled = await ScheduleRun()
      .findOneAndUpdate(
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
          $unset: { capacitySlot: 1 },
        },
        { new: false },
      )
      .lean<IScheduleRun>();
    // No-match guard: never touch schedule bookkeeping without a matching run
    // (protects against a spoofed scheduleId on a normal chat).
    if (settled == null) {
      return;
    }
    // SINGLE SEAM: the config fence is DERIVED here from the row being settled, not
    // passed in by each caller. Callers only say "this occurrence reached status X" and
    // structurally cannot forget a token — which is exactly how the reconcile and
    // balance-skip paths previously shipped unfenced.
    await applyTerminalBookkeeping({
      ...params,
      firedAt,
      expectConfigRevision: settled.configRevision,
    });
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
    let rowRevision = inserted?.configRevision;
    if (inserted == null) {
      const existing = await ScheduleRun()
        .findOne({ scheduleId: data.scheduleId, scheduledFor: data.scheduledFor })
        .select('status configRevision')
        .lean<Pick<IScheduleRun, 'status' | 'configRevision'>>();
      if (existing == null || existing.status !== data.status) {
        return;
      }
      rowRevision = existing.configRevision;
    }
    // Same single seam as recordRunOutcome: the config fence is DERIVED from the row,
    // never passed by the caller. A skip decided under an older owner config must not
    // stamp the card (or walk the balance streak toward auto-disable) on a schedule the
    // owner has since edited. Absent on either side disables the fence.
    const skipRevisionFilter = rowRevision != null ? { configRevision: rowRevision } : {};
    // Surface the skip on the card (its chip reads schedule.lastRun). An overlap
    // skip is an intervening non-balance outcome, so it BREAKS the balance-skip
    // streak (the counter is for CONSECUTIVE balance skips).
    // Through the ORDERED projection: writing `lastRun` directly dropped the
    // `scheduledFor` marker, after which the next projection read the marker as absent
    // and let an older occurrence's outcome overwrite this newer skip.
    await projectLastRun(
      data.scheduleId,
      { status: data.status, firedAt },
      data.scheduledFor,
      skipRevisionFilter,
    );
    // Same order fence as the terminal counters: these are consecutive streaks, so an
    // older occurrence settling late must not reset or extend one a newer outcome owns.
    const skipOrderFilter = {
      $or: [{ countersAsOf: { $exists: false } }, { countersAsOf: { $lte: data.scheduledFor } }],
    };
    if (data.status !== 'skipped_balance') {
      await Schedule().updateOne(
        { id: data.scheduleId, ...skipRevisionFilter, ...skipOrderFilter },
        { $set: { balanceSkipCount: 0, countersAsOf: data.scheduledFor } },
      );
    }
    if (data.status !== 'skipped_balance' || balanceSkipDisableThreshold == null) {
      return;
    }
    // Per-occurrence guard: increment the consecutive-balance-skip streak at most
    // once for this occurrence even across crash retries (same `countedFor` set the
    // terminal counters use; an occurrence is only ever skipped OR fired, never both).
    const schedule = await Schedule()
      .findOneAndUpdate(
        {
          id: data.scheduleId,
          countedFor: { $ne: data.scheduledFor },
          ...skipRevisionFilter,
          ...skipOrderFilter,
        },
        {
          $inc: { balanceSkipCount: 1 },
          $set: { countersAsOf: data.scheduledFor },
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
      // Same read-then-write window as the failure policy: any non-balance outcome
      // resets this streak, so the write must carry the count it decided on.
      await disableSchedule(data.scheduleId, 'insufficient_balance', undefined, rowRevision, {
        balanceSkipCount: { $gte: balanceSkipDisableThreshold },
      });
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
      // `started` runs are bounded by the global fireConcurrency cap, so this window
      // can never fill with rows that have nothing to do — oldest-first is right here.
      ScheduleRun()
        .find({ status: 'started', firedAt: { $lt: olderThan } })
        .sort({ firedAt: 1 })
        .limit(limit)
        .lean<IScheduleRun[]>(),
      // ROUND-ROBIN, not oldest-first. A paused run holds no capacity slot and does not
      // block its schedule's later occurrences, so pauses accumulate without bound — a
      // handful of hourly schedules can leave hundreds live at once, and the approval
      // TTL that ends them is operator-configured with no ceiling. Under oldest-first
      // the same full window of still-live pauses is re-fetched every tick while an
      // ABANDONED row behind them is never reached, so its run stays active forever.
      // Ordering by when each row was last examined (never-examined first) gives every
      // row a turn, which makes that starvation impossible for any number of pauses.
      ScheduleRun()
        .find({ status: 'requires_action', firedAt: { $lt: olderThan } })
        .sort({ reconciledAt: 1, firedAt: 1 })
        .limit(limit)
        .lean<IScheduleRun[]>(),
    ]);
    return [...started, ...paused];
  }

  /** Stamps rows as examined, so the paused window rotates instead of re-serving the
   *  same rows forever. Bookkeeping only: never touches `updatedAt`. */
  async function markRunsReconciled(runs: Array<Pick<IScheduleRun, '_id'>>): Promise<void> {
    const ids = runs.map((run) => run._id).filter((id) => id != null);
    if (ids.length === 0) {
      return;
    }
    await ScheduleRun().updateMany(
      { _id: { $in: ids } },
      { $set: { reconciledAt: new Date() } },
      { timestamps: false },
    );
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
    // Same single seam as recordRunOutcome: derive the config fence from the row, so the
    // crash-retry path cannot apply bookkeeping the inline path would have refused.
    const run = await ScheduleRun()
      .findOne({ scheduleId: params.scheduleId, scheduledFor: params.scheduledFor })
      .select('configRevision')
      .lean<Pick<IScheduleRun, 'configRevision'>>();
    await applyTerminalBookkeeping({
      ...params,
      firedAt: new Date(),
      expectConfigRevision: run?.configRevision,
    });
    await ScheduleRun().updateOne(
      { scheduleId: params.scheduleId, scheduledFor: params.scheduledFor },
      { $set: { bookkept: true } },
    );
  }

  /**
   * Deletes a run row (used to roll back a capacity reservation). Status-fenced
   * when `expectedStatus` is provided so a rollback cannot delete a row a
   * concurrent process already advanced (e.g. to a terminal outcome). Fenced
   * additionally on `expectedConversationId` so a fire only ever deletes the
   * reservation IT inserted.
   */
  async function deleteScheduleRun(
    scheduleId: string,
    scheduledFor: Date,
    expectedStatus?: ScheduleRunStatus,
    expectedConversationId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = { scheduleId, scheduledFor };
    if (expectedStatus !== undefined) {
      filter.status = expectedStatus;
    }
    if (expectedConversationId !== undefined) {
      filter.conversationId = expectedConversationId;
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
    // Keep leaseUntil/leaseBy so a fire that already leased this occurrence still
    // serializes against a re-claim while it unwinds. Only clear nextRunAt
    // (belt-and-suspenders atop enabled:false to stop new claims); the lease
    // releases itself when the fire finishes, or via TTL.
    //
    // IDEMPOTENT: deliberately NOT gated on `deleting: { $ne: true }`. The mark is the
    // first of several steps (read active runs, abort their jobs, prune checkpoints,
    // erase when drained), and if any of those threw — or the process exited — a
    // one-shot mark made every retry answer 404, stranding the schedule with its job
    // and checkpoint alive. Re-marking an already-deleting schedule is harmless (the
    // fields are already at these values; the token rotates again, which only re-fences
    // stale workers), and it lets the caller re-drive the rest of the teardown.
    return Schedule()
      .findOneAndUpdate(
        { id, user: userId },
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

  /**
   * Enabled schedules with no `nextRunAt`. Creation arms in a second write, so a crash
   * or a failed arm leaves this state — and `claimDueSchedule` sorts on `nextRunAt`, so
   * the row is permanently inert while still occupying the owner's slot.
   */
  async function getUnarmedSchedules(limit: number): Promise<ISchedule[]> {
    return Schedule()
      .find({ enabled: true, deleting: { $ne: true }, nextRunAt: { $exists: false } })
      .limit(limit)
      .lean<ISchedule[]>();
  }

  /** Arms an unarmed schedule. Conditional on still being unarmed, so it can never
   *  disturb one that armed itself (or was edited) in the meantime. */
  async function armSchedule(id: string, nextRunAt: Date): Promise<void> {
    await Schedule().updateOne(
      { id, enabled: true, deleting: { $ne: true }, nextRunAt: { $exists: false } },
      { $set: { nextRunAt } },
    );
  }

  /** Soft-deleted schedules awaiting erasure (drained of active runs). */
  async function getDeletingSchedules(limit: number): Promise<ISchedule[]> {
    return Schedule().find({ deleting: true }).limit(limit).lean<ISchedule[]>();
  }

  /** Ids of an owner's soft-deleted schedules, for a lazy erase retry on a read path
   *  in topologies that run no reconciler. Projected to ids: the caller only re-drives
   *  eraseScheduleIfDrained, and the rows carry prompt text this need not load. */
  async function getDeletingScheduleIds(
    userId: string | Types.ObjectId,
    limit: number,
  ): Promise<string[]> {
    const rows = await Schedule()
      .find({ user: userId, deleting: true })
      .select('id')
      .limit(limit)
      .lean<Array<Pick<ISchedule, 'id'>>>();
    return rows.map((row) => row.id);
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

  return {
    ensureScheduleIndexes,
    createSchedule,
    createScheduleWithSlot,
    updateScheduleById,
    deleteScheduleById,
    getScheduleById,
    getSchedulesByUser,
    countSchedulesByUser,
    claimDueSchedule,
    acquireManualRunLease,
    releaseLease,
    releaseLeaseByHolder,
    revalidateClaim,
    advanceSchedule,
    disableSchedule,
    insertScheduleRun,
    reserveStartedRun,
    getCapacityOccupancy,
    requestRunAbort,
    setRunFireDetails,
    countActiveRuns,
    deleteScheduleRun,
    markScheduleDeleting,
    getActiveRunsForSchedule,
    getActiveRunsForUser,
    disableUserSchedulesForDeletion,
    getDeletingSchedules,
    getDeletingScheduleIds,
    getUnarmedSchedules,
    armSchedule,
    eraseScheduleIfDrained,
    deleteSchedulesByUser,
    getUnbookkeptRuns,
    finalizeBookkeeping,
    recordRunOutcome,
    recordSkippedRun,
    getRunsForReconciliation,
    markRunsReconciled,
  };
}
