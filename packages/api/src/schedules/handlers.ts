import { logger } from '@librechat/data-schemas';
import { createHash, randomUUID } from 'node:crypto';
import { createSchedulePayloadSchema, updateSchedulePayloadSchema } from 'librechat-data-provider';
import type { TCreateSchedule, TUpdateSchedule } from 'librechat-data-provider';
import type { ScheduleMethods, ISchedule } from '@librechat/data-schemas';
import type { Response } from 'express';
import type {
  ScheduleDeleteResult,
  ScheduleUserContext,
  FireableSchedule,
  ScheduleLimits,
  FireResult,
} from './types';
import type { ServerRequest } from '~/types';
import { isValidTimezone, cadenceIntervalMinutes, computeNextRunAt } from './cadence';

export interface SchedulesHandlersDeps {
  methods: ScheduleMethods;
  getLimits: (user?: ScheduleUserContext) => Promise<ScheduleLimits>;
  /** Agent existence + VIEW access for the requesting user. */
  canViewAgent: (agentId: string, req: ServerRequest) => Promise<boolean>;
  /** Filters to file ids owned by the user. */
  filterOwnedFileIds: (fileIds: string[], userId: string) => Promise<string[]>;
  /** Extends a bounded renewable upload hold on attached files so they survive to the
   *  first fire, which consumes them permanently; a schedule that dies first lets the
   *  hold lapse instead of retaining the upload forever. Throws when any file is gone. */
  markFilesUsed: (fileIds: string[], userId: string) => Promise<void>;
  /** Serialized manual fire (acquires the schedule lease); null if already leased. */
  fireNow: (schedule: FireableSchedule, limits: ScheduleLimits) => Promise<FireResult | null>;
  /**
   * Soft-deletes a schedule with quiescing: stops new claims, aborts in-flight
   * runs, and erases once drained. See ScheduleDeleteResult for the honest states.
   */
  deleteSchedule: (id: string, userId: string) => Promise<ScheduleDeleteResult>;
  /** Whether this user's account deletion has begun. Fail-closed (unknown == true). */
  isUserDeleting: (userId: string) => Promise<boolean>;
}

/**
 * Rolls back a create that raced past the account-deletion cascade. Hard-deletes first;
 * if that write fails, falls back to the durable soft-delete, which makes the row
 * non-claimable at once and hands it to the reconciler's `deleting` sweep for erasure.
 * Returns false only when BOTH fail, which the caller must surface rather than
 * answering a clean 410.
 */
async function compensateLateCreate(
  deps: SchedulesHandlersDeps,
  id: string,
  userId: string,
): Promise<boolean> {
  const deleted = await deps.methods.deleteScheduleById(id, userId).catch((err) => {
    logger.error(`[schedules] compensating delete failed for late create ${id}`, err);
    return false;
  });
  if (deleted) {
    return true;
  }
  const marked = await deps.methods.markScheduleDeleting(id, userId).catch((err) => {
    logger.error(`[schedules] compensating soft-delete failed for late create ${id}`, err);
    return null;
  });
  return marked != null;
}

/**
 * Refuses a scheduling WRITE once the owner's account deletion has begun. A one-shot
 * disable scan can never close this race (a create landing after the scan is simply not
 * in it), so admission consults the durable user-level barrier instead. Fail-closed.
 */
async function rejectIfUserDeleting(
  deps: SchedulesHandlersDeps,
  userId: string,
  res: Response,
): Promise<boolean> {
  if (!(await deps.isUserDeleting(userId))) {
    return false;
  }
  res.status(410).json({ error: 'This account is being deleted' });
  return true;
}

/** Bounded attempts to extend the upload hold on a schedule's attachments. */
const FILE_RETAIN_ATTEMPTS = 3;

/** Soft-deleted rows re-checked for erasure per list request. Small: it is a retry for
 *  a rare stranded row, not a sweep, and it rides a user-facing read. */
const DEFERRED_ERASE_RETRY_LIMIT = 5;

/**
 * Digest of a create payload's FULL intent, stamped on the row at insert and never
 * edited. Replay matching compares this immutable record instead of mutable schedule
 * state, so a PATCH (or a policy auto-disable flipping `enabled`) landing between the
 * first attempt and its retry cannot make a genuine replay read as key reuse.
 */
export function computeCreateDigest(payload: TCreateSchedule): string {
  const canonical = JSON.stringify({
    name: payload.name,
    prompt: payload.prompt,
    agent_id: payload.agent_id,
    timezone: payload.timezone,
    target: payload.target,
    enabled: payload.enabled,
    cadence: {
      frequency: payload.cadence.frequency,
      hour: payload.cadence.hour,
      minute: payload.cadence.minute,
      daysOfWeek: payload.cadence.daysOfWeek ?? null,
    },
    file_ids: payload.file_ids ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function sameList<T>(left: T[] | undefined, right: T[] | undefined): boolean {
  if (left == null || right == null) {
    return (left?.length ?? 0) === (right?.length ?? 0);
  }
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Legacy replay matching for rows stamped before `clientRequestDigest` existed.
 * Deliberately omits `enabled` — a policy auto-disable mutates it, and this
 * comparison exists precisely because mutable state makes a poor replay record.
 */
function matchesCreatedSchedule(existing: ISchedule, payload: TCreateSchedule): boolean {
  return (
    existing.name === payload.name &&
    existing.prompt === payload.prompt &&
    existing.agent_id === payload.agent_id &&
    existing.timezone === payload.timezone &&
    existing.target === payload.target &&
    existing.cadence?.frequency === payload.cadence.frequency &&
    existing.cadence?.hour === payload.cadence.hour &&
    existing.cadence?.minute === payload.cadence.minute &&
    sameList(existing.cadence?.daysOfWeek, payload.cadence.daysOfWeek) &&
    sameList(existing.file_ids, payload.file_ids)
  );
}

/** Whether an existing row is the schedule this create attempt is asking for: the
 *  immutable digest when the row carries one, the legacy field comparison otherwise. */
function matchesCreateIntent(
  existing: ISchedule,
  payload: TCreateSchedule,
  digest: string,
): boolean {
  if (existing.clientRequestDigest != null) {
    return existing.clientRequestDigest === digest;
  }
  return matchesCreatedSchedule(existing, payload);
}

/** Public projection of a schedule — an allowlist of the `TSchedule` fields, so internal
 *  bookkeeping (_id, tenantId, __v, claimToken, lease*, slot, deleting, countedFor,
 *  balanceSkipCount, bookkept, ...) never reaches the browser. */
export type WireSchedule = Pick<
  ISchedule,
  | 'id'
  | 'user'
  | 'name'
  | 'prompt'
  | 'agent_id'
  | 'cadence'
  | 'timezone'
  | 'target'
  | 'file_ids'
  | 'enabled'
  | 'disabledReason'
  | 'nextRunAt'
  | 'lastRun'
  | 'runCount'
  | 'failureCount'
  | 'createdAt'
  | 'updatedAt'
>;

export function toWireSchedule(schedule: ISchedule): WireSchedule {
  return {
    id: schedule.id,
    user: schedule.user,
    name: schedule.name,
    prompt: schedule.prompt,
    agent_id: schedule.agent_id,
    cadence: schedule.cadence,
    timezone: schedule.timezone,
    target: schedule.target,
    file_ids: schedule.file_ids,
    enabled: schedule.enabled,
    disabledReason: schedule.disabledReason,
    nextRunAt: schedule.nextRunAt,
    lastRun: schedule.lastRun,
    runCount: schedule.runCount,
    failureCount: schedule.failureCount,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

function requestUser(req: ServerRequest): { id: string; tenantId?: string; role?: string } {
  const user = req.user as { id: string; tenantId?: string; role?: string };
  return { id: user.id, tenantId: user.tenantId, role: user.role };
}

type ScheduleHandler = (req: ServerRequest, res: Response) => Promise<void>;

export interface SchedulesHandlers {
  listSchedules: ScheduleHandler;
  getSchedule: ScheduleHandler;
  createSchedule: ScheduleHandler;
  updateSchedule: ScheduleHandler;
  deleteSchedule: ScheduleHandler;
  runScheduleNow: ScheduleHandler;
}

export function createSchedulesHandlers(deps: SchedulesHandlersDeps): SchedulesHandlers {
  async function validatePayload(
    req: ServerRequest,
    res: Response,
    payload: TCreateSchedule | TUpdateSchedule,
    limits: ScheduleLimits,
  ): Promise<boolean> {
    if (payload.timezone != null && !isValidTimezone(payload.timezone)) {
      res.status(400).json({ error: 'Invalid IANA timezone' });
      return false;
    }
    if (
      payload.cadence != null &&
      cadenceIntervalMinutes(payload.cadence) < limits.minIntervalMinutes
    ) {
      res.status(400).json({
        error: `Schedule interval must be at least ${limits.minIntervalMinutes} minutes`,
      });
      return false;
    }
    if (payload.agent_id != null && !(await deps.canViewAgent(payload.agent_id, req))) {
      res.status(400).json({ error: 'Agent not found or not accessible' });
      return false;
    }
    if (payload.file_ids != null && payload.file_ids.length > 0) {
      const owned = await deps.filterOwnedFileIds(payload.file_ids, requestUser(req).id);
      if (owned.length !== payload.file_ids.length) {
        res.status(400).json({ error: 'One or more attached files were not found' });
        return false;
      }
    }
    return true;
  }

  /**
   * Extends the bounded upload hold on attached files (so they survive to the first
   * fire, which consumes them permanently), with bounded retry. Returns false when it
   * exhausts retries — the caller then compensates (roll back the create / revert the
   * edit) so a persisted schedule never references files the upload sweep is about to
   * reap.
   */
  async function retainFiles(fileIds: string[], userId: string): Promise<boolean> {
    for (let attempt = 1; attempt <= FILE_RETAIN_ATTEMPTS; attempt++) {
      try {
        await deps.markFilesUsed(fileIds, userId);
        return true;
      } catch (err) {
        logger.error(
          `[schedules] attachment retention failed (attempt ${attempt}/${FILE_RETAIN_ATTEMPTS}):`,
          err,
        );
      }
    }
    return false;
  }

  /**
   * Re-drives the deferred erase of the caller's soft-deleted schedules, off the
   * response path.
   *
   * A `deleting` row is erased by whichever actor observes it drained: the delete
   * request itself, or the terminal outcome write (erase-on-settle). Both are
   * best-effort single attempts, and the reconciler that would otherwise retry does not
   * exist in the clustered entrypoint — so one transient failure, or a lease that
   * outlived the delete, strands a hidden row holding the user's prompt indefinitely.
   * The row is hidden from the list, so the owner cannot even retry it themselves.
   *
   * A read the owner performs anyway is the cheapest place to retry: bounded, scoped to
   * their own rows, and a no-op when nothing is deleting (the erase re-checks drained-ness
   * itself, so this can never race a live run).
   */
  function retryDeferredErases(userId: string): void {
    void deps.methods
      .getDeletingScheduleIds(userId, DEFERRED_ERASE_RETRY_LIMIT)
      .then((ids) =>
        Promise.all(ids.map((id) => deps.methods.eraseScheduleIfDrained(id).catch(() => false))),
      )
      .catch((err) => logger.warn('[schedules] deferred erase retry failed', err));
  }

  async function listSchedules(req: ServerRequest, res: Response): Promise<void> {
    const [schedules, limits] = await Promise.all([
      deps.methods.getSchedulesByUser(requestUser(req).id),
      deps.getLimits(requestUser(req)),
    ]);
    retryDeferredErases(requestUser(req).id);
    res.json({
      schedules: schedules.map(toWireSchedule),
      limits: { maxPerUser: limits.maxPerUser },
    });
  }

  async function getSchedule(req: ServerRequest, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const schedule = await deps.methods.getScheduleById(id, requestUser(req).id);
    if (schedule == null) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.json(toWireSchedule(schedule));
  }

  async function createSchedule(req: ServerRequest, res: Response): Promise<void> {
    const parsed = createSchedulePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid schedule payload', issues: parsed.error.issues });
      return;
    }
    const user = requestUser(req);
    if (await rejectIfUserDeleting(deps, user.id, res)) {
      return;
    }
    const limits = await deps.getLimits(user);
    if (!limits.enabled) {
      res.status(403).json({ error: 'Scheduled chats are disabled' });
      return;
    }
    if (!(await validatePayload(req, res, parsed.data, limits))) {
      return;
    }
    const digest = computeCreateDigest(parsed.data);

    /**
     * Answers a retry with the row its FIRST attempt committed — an ESTABLISHED
     * schedule this attempt must never reshape. Re-drives only the arm (guarded:
     * only-if-still-unarmed, jitter derived from the EXISTING row's id, no claim-token
     * rotation or revision bump, so an active run is never fenced off), and never
     * compensates: rollback belongs exclusively to the attempt that inserted a row.
     */
    const respondToReplay = async (existing: ISchedule): Promise<void> => {
      // A key identifies one create INTENT. Reusing it for different content is a
      // client bug, and silently returning the first row would hide it behind a 201
      // describing a schedule the caller did not ask for — so say so instead.
      if (!matchesCreateIntent(existing, parsed.data, digest)) {
        res.status(409).json({
          error: 'clientRequestId was already used to create a different schedule',
        });
        return;
      }
      // The key stays claimed while its row drains (the unique index spans deleting
      // rows), so a retry of a create whose schedule was since deleted resolves here.
      if (existing.deleting === true) {
        res.status(410).json({ error: 'Schedule no longer exists' });
        return;
      }
      if (await deps.isUserDeleting(user.id)) {
        res.status(410).json({ error: 'This account is being deleted' });
        return;
      }
      if (existing.enabled && existing.nextRunAt == null) {
        const next = computeNextRunAt({
          cadence: existing.cadence,
          timezone: existing.timezone,
          scheduleId: existing.id,
        });
        if (next != null) {
          try {
            await deps.methods.armSchedule(existing.id, next);
          } catch (armError) {
            logger.error(`[schedules] replay arming failed for ${existing.id}`, armError);
            res.status(500).json({ error: 'Failed to create schedule. Please retry.' });
            return;
          }
        }
      }
      const fresh = await deps.methods.getScheduleById(existing.id, user.id);
      if (fresh == null) {
        res.status(410).json({ error: 'Schedule no longer exists' });
        return;
      }
      logger.info(`[schedules] create retry resolved to ${existing.id} for user ${user.id}`);
      res.status(201).json(toWireSchedule(fresh));
    };

    // Resolve a retry BEFORE the capacity pre-check: a retry whose first attempt
    // already occupies the final slot is a replay of THAT row, not a request for a
    // new one — refusing it as over-limit would deny the client the very row it is
    // trying to confirm.
    const replayed = await deps.methods.getScheduleByClientRequestId(
      user.id,
      parsed.data.clientRequestId,
    );
    if (replayed != null) {
      await respondToReplay(replayed);
      return;
    }
    // Fail fast on an obvious over-limit BEFORE retaining attachments, so the common
    // case never clears an upload TTL it then can't use. The {user, slot} partial
    // unique index below is the atomic arbiter for the concurrent-create race.
    if ((await deps.methods.countSchedulesByUser(user.id)) >= limits.maxPerUser) {
      res.status(400).json({
        error: `Schedule limit reached (${limits.maxPerUser}). Delete a schedule to add another.`,
      });
      return;
    }
    // Retain attachments BEFORE creating, so a persisted (claimable) schedule never
    // references uploads still eligible for TTL expiry — there is no create-then-
    // retain window where a crash or a failed rollback leaves the two inconsistent.
    if (parsed.data.file_ids?.length && !(await retainFiles(parsed.data.file_ids, user.id))) {
      res.status(500).json({ error: 'Failed to retain schedule attachments' });
      return;
    }
    const id = `sched_${randomUUID()}`;
    const nextRunAt = parsed.data.enabled
      ? computeNextRunAt({
          cadence: parsed.data.cadence,
          timezone: parsed.data.timezone,
          scheduleId: id,
        })
      : undefined;
    // Atomic cap: createScheduleWithSlot claims a free per-user slot via the
    // {user, slot} partial unique index, so concurrent creates can never exceed
    // maxPerUser. 'limit' means a concurrent racer took the last slot after the
    // pre-check above; the just-retained files are then unreferenced (a rare, minor
    // leak of the user's own uploads) — acceptable vs. a partial/expiring commit.
    // Inserted WITHOUT nextRunAt regardless of `enabled`: the engine claims by
    // nextRunAt, so the row is inert until armed below. That is what makes the
    // barrier re-check durable — every failure mode leaves a row that cannot fire,
    // rather than one that fires for an account already being erased. The reconciler's
    // unarmed sweep later arms anything left this way, so an inert row is a delay, not
    // a permanent state.
    const created = await deps.methods.createScheduleWithSlot(
      {
        ...parsed.data,
        id,
        user: user.id as never,
        tenantId: user.tenantId,
        clientRequestDigest: digest,
      },
      limits.maxPerUser,
    );
    if (created === 'limit') {
      // A CONCURRENT first attempt with this key can be what filled the last slot;
      // resolve to it rather than refusing the retry for being at capacity.
      const raced = await deps.methods.getScheduleByClientRequestId(
        user.id,
        parsed.data.clientRequestId,
      );
      if (raced != null) {
        await respondToReplay(raced);
        return;
      }
      res.status(400).json({
        error: `Schedule limit reached (${limits.maxPerUser}). Delete a schedule to add another.`,
      });
      return;
    }
    if (created.id !== id) {
      // The allocator hit the idempotency index: a concurrent attempt with this key
      // committed first. That row is established — hand it to the replay path.
      await respondToReplay(created);
      return;
    }
    // FRESH insert (this attempt owns the row) from here down; compensation is safe.
    //
    // POST-INSERT barrier re-check. The admission check at the top of this handler
    // shrinks the window to roughly one request, but cannot close it: account deletion
    // can raise the barrier after we passed that check and before this insert landed,
    // and its one-shot disable scan would not have seen a row that did not exist yet.
    // Re-checking AFTER the write is what makes the barrier authoritative.
    if (await deps.isUserDeleting(user.id)) {
      // Best-effort tidy-up of an unarmed row. Its failure is reported but no longer
      // load-bearing for BILLING: the row is unarmed, and even once the reconciler's
      // sweep arms it, the fire path refuses it at the account-deletion barrier
      // (isOwnerDeleting). The residual is a retained row, not a billed generation.
      if (!(await compensateLateCreate(deps, id, user.id))) {
        res.status(500).json({ error: 'Failed to roll back schedule creation' });
        return;
      }
      res.status(410).json({ error: 'This account is being deleted' });
      return;
    }
    // ARM last, fenced on the revision stamped at insert: a PATCH racing this arm
    // bumps configRevision, and this POST must not overwrite the nextRunAt that PATCH
    // derived from newer config with one derived from the create payload.
    let armed = created;
    if (nextRunAt) {
      let updated: ISchedule | null;
      try {
        updated = await deps.methods.updateScheduleById(id, user.id, { nextRunAt }, undefined, {
          expectedConfigRevision: created.configRevision ?? 0,
        });
      } catch (armError) {
        // Roll back ONLY while the row is still unarmed. An ambiguously-committed arm
        // — or a concurrent replay of this key that armed the row and already answered
        // 201 — leaves an ARMED row that must survive; deleting it would erase a
        // schedule another response has confirmed.
        logger.error(`[schedules] arming failed for ${id}; rolling back the create`, armError);
        const rolledBack = await deps.methods.deleteUnarmedSchedule(id, user.id).catch(() => null);
        if (rolledBack === 'armed') {
          const current = await deps.methods.getScheduleById(id, user.id);
          if (current != null) {
            res.status(201).json(toWireSchedule(current));
            return;
          }
        }
        // A retry is always safe: the same key collides on the idempotency index and
        // resolves to whatever this attempt left behind (or a clean re-insert).
        res.status(500).json({ error: 'Failed to create schedule. Please retry.' });
        return;
      }
      if (updated == null) {
        // Either the row is gone (the deletion cascade claimed it), or a concurrent
        // PATCH moved the revision — in which case ITS validation and arming govern,
        // and this POST reports the row as that edit left it.
        const current = await deps.methods.getScheduleById(id, user.id);
        if (current != null) {
          res.status(201).json(toWireSchedule(current));
          return;
        }
        res.status(410).json({ error: 'Schedule no longer exists' });
        return;
      }
      armed = updated;
    }
    logger.info(`[schedules] created ${id} for user ${user.id}`);
    res.status(201).json(toWireSchedule(armed));
  }

  async function updateSchedule(req: ServerRequest, res: Response): Promise<void> {
    const parsed = updateSchedulePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid schedule payload', issues: parsed.error.issues });
      return;
    }
    const { id } = req.params as { id: string };
    const user = requestUser(req);
    if (await rejectIfUserDeleting(deps, user.id, res)) {
      return;
    }
    const existing = await deps.methods.getScheduleById(id, user.id);
    if (existing == null) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    const limits = await deps.getLimits(user);
    // When the owner's config disables schedules, block edits that keep the
    // schedule enabled; still allow turning one OFF.
    if (!limits.enabled && (parsed.data.enabled ?? existing.enabled)) {
      res.status(403).json({ error: 'Scheduled chats are disabled' });
      return;
    }
    if (!(await validatePayload(req, res, parsed.data, limits))) {
      return;
    }
    const cadence = parsed.data.cadence ?? existing.cadence;
    const timezone = parsed.data.timezone ?? existing.timezone;
    const enabled = parsed.data.enabled ?? existing.enabled;
    // Re-validate the EFFECTIVE (possibly stored) cadence against the current
    // floor whenever this edit leaves the schedule enabled — otherwise a bare
    // {enabled:true} could re-enable an existing schedule that now runs too often.
    if (enabled && cadenceIntervalMinutes(cadence) < limits.minIntervalMinutes) {
      res.status(400).json({
        error: `Schedule interval must be at least ${limits.minIntervalMinutes} minutes`,
      });
      return;
    }
    // A supplied agent_id is validated in validatePayload; when an edit omits it
    // but leaves the schedule enabled (e.g. toggling `enabled` back on after an
    // agent_deleted/permission_revoked auto-disable), re-validate the STORED
    // agent too. Otherwise re-enabling clears disabledReason for a target the
    // next fire would immediately reject and disable again.
    if (
      enabled &&
      parsed.data.agent_id == null &&
      !(await deps.canViewAgent(existing.agent_id, req))
    ) {
      res.status(400).json({ error: 'Agent not found or not accessible' });
      return;
    }
    const cadenceChanged =
      parsed.data.cadence != null || parsed.data.timezone != null || parsed.data.enabled != null;
    const reEnabled = parsed.data.enabled === true && existing.enabled === false;
    // RECOVERY: an enabled schedule with no nextRunAt is inert — claimDueSchedule sorts
    // on nextRunAt and can never select it. Creation arms in a second write, so a crash
    // or a failed arm leaves exactly this state; re-arm on ANY edit rather than only a
    // cadence one, or a name/prompt edit would silently leave it dead.
    const needsArming = existing.nextRunAt == null;
    const update: Partial<ISchedule> = { ...parsed.data } as Partial<ISchedule>;
    if (enabled && (cadenceChanged || needsArming)) {
      const nextRunAt = computeNextRunAt({ cadence, timezone, scheduleId: existing.id });
      if (nextRunAt == null) {
        res.status(400).json({ error: 'Schedule has no computable next run' });
        return;
      }
      update.nextRunAt = nextRunAt;
    }
    if (reEnabled) {
      update.failureCount = 0;
      update.balanceSkipCount = 0;
    }
    const unset = reEnabled ? { disabledReason: 1 as const } : undefined;
    // Retain the new attachments BEFORE committing the edit, so a retention failure
    // leaves the ENTIRE schedule unchanged rather than persisting prompt/cadence/
    // agent/enabled changes while only reverting file_ids. A file whose TTL was
    // cleared before the edit failed simply persists unreferenced (the user's own
    // upload) — a minor leak, not a partial config change future runs would use.
    if (parsed.data.file_ids?.length && !(await retainFiles(parsed.data.file_ids, user.id))) {
      res.status(500).json({ error: 'Failed to retain schedule attachments' });
      return;
    }
    // FENCED on the revision this edit was computed from. `nextRunAt` above is derived
    // from (cadence, timezone) resolved against the row read at the top of this handler,
    // so two overlapping edits — one changing cadence, one changing timezone — would
    // each persist a nextRunAt consistent with neither final state, and it would stay
    // wrong until the next edit (advanceSchedule recomputes from the row, so a fire
    // propagates the bad occurrence rather than repairing it). configRevision is already
    // the row's edit generation and is $inc'd inside the same atomic update, so the
    // loser simply retries against fresh state.
    const schedule = await deps.methods.updateScheduleById(existing.id, user.id, update, unset, {
      expectedConfigRevision: existing.configRevision,
    });
    if (schedule == null) {
      // Either the row is gone, or a concurrent edit moved the revision. Distinguish
      // them so the owner sees a retryable conflict rather than a phantom 404.
      const stillThere = await deps.methods.getScheduleById(existing.id, user.id);
      if (stillThere != null) {
        res.status(409).json({ error: 'Schedule was modified concurrently. Please retry.' });
        return;
      }
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.json(toWireSchedule(schedule));
  }

  async function deleteSchedule(req: ServerRequest, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    // Quiesce-then-erase: disable + mark deleting (stops new claims, hides it),
    // abort in-flight loopback jobs, and erase once drained — so a live run's
    // evidence is never destroyed out from under it.
    const result = await deps.deleteSchedule(id, requestUser(req).id);
    if (result === 'not_found') {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    // HONEST failure: at least one active run could not be confirmed stopped, so its
    // generation may still be producing and billing. The schedule is already hidden
    // and fenced (no new claims), and the delete is idempotent — a retry re-runs the
    // drain. Reporting success here would claim the run was stopped.
    if (result === 'unconfirmed') {
      res.set('Retry-After', '30');
      res.status(503).json({
        error: 'Could not confirm the active run was stopped. Please retry shortly.',
      });
      return;
    }
    // 202 for `draining`: the aborts were delivered but a generation has not yet
    // recorded its terminal outcome. The schedule is hidden and erasure follows the
    // settlement (erase-on-settle), in any topology.
    res.status(result === 'draining' ? 202 : 200).json({ id });
  }

  async function runScheduleNow(req: ServerRequest, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    if (await rejectIfUserDeleting(deps, requestUser(req).id, res)) {
      return;
    }
    const schedule = await deps.methods.getScheduleById(id, requestUser(req).id);
    if (schedule == null) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    const limits = await deps.getLimits(requestUser(req));
    const result = await deps.fireNow(schedule, limits);
    if (result == null) {
      res.status(409).json({ error: 'A run for this schedule is already in progress' });
      return;
    }
    if (!result.fired) {
      // A limiter refusal is the caller's own quota, not a conflicting schedule state,
      // so answer 429 rather than burying it in the generic 409.
      res.status(result.skipped === 'rate_limited' ? 429 : 409).json({
        error:
          result.skipped === 'rate_limited'
            ? 'Too many messages. Try running this schedule again shortly.'
            : (result.error ?? `Run skipped (${result.skipped ?? 'unknown'})`),
        skipped: result.skipped,
      });
      return;
    }
    res.json({ scheduleId: schedule.id, conversationId: result.conversationId, status: 'started' });
  }

  return {
    listSchedules,
    getSchedule,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runScheduleNow,
  };
}

export type { ScheduleUserContext };
