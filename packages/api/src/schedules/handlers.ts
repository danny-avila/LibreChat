import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { createSchedulePayloadSchema, updateSchedulePayloadSchema } from 'librechat-data-provider';
import type { TCreateSchedule, TUpdateSchedule } from 'librechat-data-provider';
import type { ScheduleMethods, ISchedule } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ScheduleLimits, ScheduleUserContext, FireResult, FireableSchedule } from './types';
import type { ServerRequest } from '~/types';
import { isValidTimezone, cadenceIntervalMinutes, computeNextRunAt } from './cadence';

export interface SchedulesHandlersDeps {
  methods: ScheduleMethods;
  getLimits: (user?: ScheduleUserContext) => Promise<ScheduleLimits>;
  /** Agent existence + VIEW access for the requesting user. */
  canViewAgent: (agentId: string, req: ServerRequest) => Promise<boolean>;
  /** Filters to file ids owned by the user. */
  filterOwnedFileIds: (fileIds: string[], userId: string) => Promise<string[]>;
  /** Clears the upload TTL on attached files so they survive until the first run. */
  markFilesUsed: (fileIds: string[], userId: string) => Promise<void>;
  /** Serialized manual fire (acquires the schedule lease); null if already leased. */
  fireNow: (schedule: FireableSchedule, limits: ScheduleLimits) => Promise<FireResult | null>;
  /**
   * Soft-deletes a schedule with quiescing: stops new claims, aborts in-flight
   * runs, and erases once drained. Returns false when not found / already deleting.
   */
  deleteSchedule: (id: string, userId: string) => Promise<boolean>;
}

/** Bounded attempts to clear the upload TTL on a schedule's attachments. */
const FILE_RETAIN_ATTEMPTS = 3;

function toWireSchedule(schedule: ISchedule) {
  const {
    leaseUntil: _leaseUntil,
    leaseBy: _leaseBy,
    claimToken: _claimToken,
    slot: _slot,
    deleting: _deleting,
    ...rest
  } = schedule;
  return rest;
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
   * Clears the upload TTL on attached files (so they survive to the first fire),
   * with bounded retry. Returns false when it exhausts retries — the caller then
   * compensates (roll back the create / revert the edit) so a persisted schedule
   * never references files the upload sweep is about to reap.
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

  async function listSchedules(req: ServerRequest, res: Response): Promise<void> {
    const [schedules, limits] = await Promise.all([
      deps.methods.getSchedulesByUser(requestUser(req).id),
      deps.getLimits(requestUser(req)),
    ]);
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
    const limits = await deps.getLimits(user);
    if (!limits.enabled) {
      res.status(403).json({ error: 'Scheduled chats are disabled' });
      return;
    }
    if (!(await validatePayload(req, res, parsed.data, limits))) {
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
    // maxPerUser (no check-then-insert window). 'limit' means all slots are taken.
    const created = await deps.methods.createScheduleWithSlot(
      {
        ...parsed.data,
        id,
        user: user.id as never,
        tenantId: user.tenantId,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
      limits.maxPerUser,
    );
    if (created === 'limit') {
      res.status(400).json({
        error: `Schedule limit reached (${limits.maxPerUser}). Delete a schedule to add another.`,
      });
      return;
    }
    // Retain attachments; on total failure roll the schedule back so a persisted
    // schedule never outlives its attachments (which the upload TTL would reap).
    if (parsed.data.file_ids?.length && !(await retainFiles(parsed.data.file_ids, user.id))) {
      await deps.methods.deleteScheduleById(id, user.id).catch(() => undefined);
      res.status(500).json({ error: 'Failed to retain schedule attachments' });
      return;
    }
    logger.info(`[schedules] created ${id} for user ${user.id}`);
    res.status(201).json(toWireSchedule(created));
  }

  async function updateSchedule(req: ServerRequest, res: Response): Promise<void> {
    const parsed = updateSchedulePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid schedule payload', issues: parsed.error.issues });
      return;
    }
    const { id } = req.params as { id: string };
    const user = requestUser(req);
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
    const update: Partial<ISchedule> = { ...parsed.data } as Partial<ISchedule>;
    if (enabled && cadenceChanged) {
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
    const schedule = await deps.methods.updateScheduleById(existing.id, user.id, update, unset);
    if (schedule == null) {
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
    const deleted = await deps.deleteSchedule(id, requestUser(req).id);
    if (!deleted) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }
    res.json({ id });
  }

  async function runScheduleNow(req: ServerRequest, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
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
      res.status(409).json({
        error: result.error ?? `Run skipped (${result.skipped ?? 'unknown'})`,
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
