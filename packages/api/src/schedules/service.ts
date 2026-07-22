import { logger, runAsSystem, tenantStorage } from '@librechat/data-schemas';
import { getRefillEligibilityDate, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { ScheduleMethods, AppConfig, IBalance } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type {
  ScheduleEngineDeps,
  ScheduleLimits,
  ScheduleUserContext,
  FireableSchedule,
  FireResult,
  JobIdentity,
} from './types';
import type { SerializableJobData } from '../stream/interfaces/IJobStore';
import type { BalanceUpdateFields } from '../types/balance';
import type { GetAppConfigOptions } from '../app/service';
import { generateShortLivedToken, SCHEDULE_FIRE_SCOPE } from '../crypto/jwt';
import { GenerationJobManager } from '../stream/GenerationJobManager';
import { buildBalanceUpdateFields } from '../middleware/balance';
import { deleteAgentCheckpoint } from '../agents/checkpointer';
import { fireSchedule, SCHEDULE_FIRE_TOKEN_TTL } from './fire';
import { getAppConfigOptionsFromUser } from '../app/service';
import { DEFAULT_SCHEDULE_LIMITS } from './types';
import { getBalanceConfig } from '../app/config';
import { startScheduleEngine } from './engine';

/** Recordable terminal/paused run outcome, as accepted by `recordRunOutcome`. */
type ScheduleRunOutcomeStatus = Parameters<ScheduleMethods['recordRunOutcome']>[0]['status'];

/**
 * Outcome of the pre-claim resume reservation for a HITL resume. `gone` = the
 * schedule was deleted/soft-deleted (non-resumable); `overlap` = another occurrence
 * is active; `capacity` = the global cap is saturated; each defers with the approval
 * left unconsumed. `ok` = reserved (or already active), let the claim proceed.
 */
export type ResumeCheck = 'ok' | 'gone' | 'overlap' | 'capacity';

/** Whether a persisted job still carries a given scheduled occurrence's identity. */
function jobMatchesIdentity(job: SerializableJobData, identity: JobIdentity): boolean {
  if (job.scheduleId !== identity.scheduleId || job.scheduledFor == null) {
    return false;
  }
  return new Date(job.scheduledFor).getTime() === new Date(identity.scheduledFor).getTime();
}

export interface RecordScheduleOutcomeInput {
  scheduleId?: string;
  scheduledFor?: string | Date;
  status: ScheduleRunOutcomeStatus;
  conversationId?: string;
  error?: string;
}

/**
 * Api-side dependencies the schedules service needs injected: model methods,
 * config/balance access, and the owner-scoped agent access check. Everything
 * else (job store, tenant context, token minting) lives in `@librechat/api` and
 * is imported directly.
 */
export interface SchedulesServiceDeps {
  methods: ScheduleMethods & {
    getRoleByName: (
      role?: string,
    ) => Promise<{ permissions?: Record<string, Record<string, boolean | undefined>> } | null>;
    getFiles: (
      filter: unknown,
      sort: unknown,
      select: unknown,
    ) => Promise<Array<{
      file_id: string;
      filepath: string;
      filename: string;
      type: string;
      height?: number;
      width?: number;
      source: string;
    }> | null>;
  };
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig | undefined>;
  findUserById: (
    userId: string | Types.ObjectId,
  ) => Promise<{ _id: Types.ObjectId; tenantId?: string; role?: string } | null>;
  findBalance: (userId: string) => Promise<IBalance | null>;
  upsertBalance: (userId: string, fields: BalanceUpdateFields) => Promise<IBalance | null>;
  resolveAgentFireAccess: (
    agentId: string,
    user: ScheduleUserContext,
  ) => Promise<'ok' | 'missing' | 'forbidden'>;
}

export interface SchedulesService {
  getLimits: (user?: ScheduleUserContext) => Promise<ScheduleLimits>;
  engineDeps: ScheduleEngineDeps;
  fireScheduleNow: (
    schedule: FireableSchedule,
    limits: ScheduleLimits,
  ) => Promise<FireResult | null>;
  recordScheduleOutcome: (input: RecordScheduleOutcomeInput) => Promise<boolean>;
  /**
   * Whether a schedule is still live (exists and not soft-deleted). The loopback
   * chat controller calls this right after creating the generation job to re-fence
   * a fire against a delete/quiesce that landed in the claim -> POST window (when
   * the reservation row exists but the job did not yet, so the deletion's abort
   * missed it) — aborting before any messages are persisted.
   */
  isScheduleLive: (scheduleId: string) => Promise<boolean>;
  /**
   * Atomically reserves the active slot for a HITL resume BEFORE the approval claim
   * (so a deferral leaves the approval claimable): promotes the paused run to
   * `started` (the single-active partial index makes per-schedule overlap atomic)
   * and reserve-then-verifies the global fireConcurrency cap, rolling back its OWN
   * promotion on overshoot. 'gone' = the schedule was deleted; 'overlap' = another
   * occurrence is active; 'capacity' = global cap saturated. The caller must NOT
   * release on a lost approval claim — the claim winner drives whatever is `started`;
   * an unclaimed promotion self-heals when the reconciler surfaces the pause.
   */
  reserveScheduledResume: (scheduleId: string, scheduledFor: string | Date) => Promise<ResumeCheck>;
  /** Soft-deletes an owner's schedule: stop claims, abort active runs, drain, erase. */
  deleteScheduleForOwner: (scheduleId: string, userId: string) => Promise<boolean>;
  /** Quiesces all of a user's schedules ahead of account deletion (stop + abort). */
  quiesceUserSchedules: (userId: string) => Promise<void>;
  initializeScheduleEngine: (options?: {
    clustered?: boolean;
  }) => Promise<ReturnType<typeof startScheduleEngine> | undefined>;
}

/**
 * Builds the scheduler service around api-side dependencies. Each call owns its
 * own engine singleton and job-store-shared flag, so state never leaks between
 * instances.
 */
export function createSchedulesService(deps: SchedulesServiceDeps): SchedulesService {
  const { methods } = deps;

  /**
   * Resolves schedule limits, honoring per-principal (role/user) config overrides
   * when a user is supplied (routes pass req.user, the fire path passes the owner).
   */
  async function getLimits(user?: ScheduleUserContext): Promise<ScheduleLimits> {
    const appConfig = user
      ? await deps.getAppConfig(getAppConfigOptionsFromUser(user))
      : await deps.getAppConfig();
    const config = appConfig?.interfaceConfig?.schedules;
    // Disabled config is a hard stop: the engine must not keep firing existing
    // schedules after an admin turns the feature off.
    if (config === false) {
      return { ...DEFAULT_SCHEDULE_LIMITS, enabled: false };
    }
    if (config == null || typeof config === 'boolean') {
      return DEFAULT_SCHEDULE_LIMITS;
    }
    return {
      enabled: config.use !== false,
      maxPerUser: config.maxPerUser ?? DEFAULT_SCHEDULE_LIMITS.maxPerUser,
      minIntervalMinutes: config.minIntervalMinutes ?? DEFAULT_SCHEDULE_LIMITS.minIntervalMinutes,
      autoDisableAfterFailures:
        config.autoDisableAfterFailures ?? DEFAULT_SCHEDULE_LIMITS.autoDisableAfterFailures,
      fireConcurrency: config.fireConcurrency ?? DEFAULT_SCHEDULE_LIMITS.fireConcurrency,
    };
  }

  const MANUAL_RUN_LEASE_MS = 5 * 60 * 1000;
  // Bounded wait for aborted scheduled runs to settle during account-deletion quiesce,
  // before the message/conversation cascade runs. Long enough to cover a generation that
  // already returned from the model finishing its persistence; capped so account deletion
  // never blocks indefinitely on an unreachable peer-worker run.
  const QUIESCE_DRAIN_TIMEOUT_MS = 10 * 1000;
  const QUIESCE_DRAIN_POLL_MS = 250;

  // Whether this deployment runs multiple engine replicas. Combined with the live
  // job-store backend (GenerationJobManager.isRedis), this decides isJobStoreShared:
  // a clustered deployment whose stream store is in-memory (each worker private) is
  // NOT shared and must skip cross-worker orphan reaping. Set from USE_REDIS (the
  // clustering proxy) via initializeScheduleEngine; single-process defaults false.
  let clustered = false;

  /**
   * Whether a refill would top up this zero-credit balance record right now,
   * mirroring the chat balance check's auto-refill eligibility (record-based).
   */
  function isRefillEligible(record: IBalance | null | undefined): boolean {
    if (record?.autoRefillEnabled !== true) {
      return false;
    }
    if (!(typeof record.refillAmount === 'number' && record.refillAmount > 0)) {
      return false;
    }
    const lastRefillDate = new Date(record.lastRefill ?? 0);
    if (Number.isNaN(lastRefillDate.getTime())) {
      return true;
    }
    // Mirror checkBalanceRecord's fallbacks exactly (interval 0 / 'days' when a
    // partially-synced record is missing them) so we never pre-skip a record the
    // interactive chat balance check would have refilled.
    return (
      new Date() >=
      getRefillEligibilityDate(
        lastRefillDate,
        record.refillIntervalValue ?? 0,
        record.refillIntervalUnit ?? 'days',
      )
    );
  }

  const engineDeps: ScheduleEngineDeps = {
    methods,
    getLimits,
    getUserContext: async (userId) => {
      const user = await deps.findUserById(userId);
      if (user == null) {
        return null;
      }
      return { id: user._id.toString(), tenantId: user.tenantId, role: user.role };
    },
    hasScheduleAccess: async (user) => {
      const role = await methods.getRoleByName(user.role);
      return role?.permissions?.[PermissionTypes.SCHEDULES]?.[Permissions.USE] === true;
    },
    isOutOfBalance: async (user) => {
      const appConfig = await deps.getAppConfig(getAppConfigOptionsFromUser(user));
      const balanceConfig = getBalanceConfig(appConfig);
      if (balanceConfig?.enabled !== true) {
        return false;
      }
      let record = await deps.findBalance(user.id);
      // Initialize/sync the record exactly as the chat's balance middleware would,
      // so a new user's startBalance is applied before we read it (avoids skipping
      // a schedule that an interactive chat would have allowed).
      if (balanceConfig.startBalance != null) {
        const updateFields = buildBalanceUpdateFields(balanceConfig, record, user.id);
        if (Object.keys(updateFields).length > 0) {
          record = await deps.upsertBalance(user.id, updateFields);
        }
      }
      const credits = record?.tokenCredits ?? 0;
      if (credits > 0) {
        return false;
      }
      // At/below zero: an auto-refill user is only spared a pre-skip when a refill
      // would actually fire now (mirrors the chat balance check's eligibility). If
      // they aren't eligible yet, or the refill settings are incomplete, pre-skip as
      // a balance skip — otherwise the zero-credit fire reaches the chat, is rejected
      // there, and records a generic error that walks the schedule toward
      // too_many_failures instead of skipped_balance/insufficient_balance.
      if (balanceConfig.autoRefillEnabled === true && isRefillEligible(record)) {
        return false;
      }
      return true;
    },
    // Mirrors the loopback chat route's authorization (role AGENTS:USE + resource
    // VIEW with the manage:agents bypass); shared with the create/update precheck
    // so the two never diverge.
    agentAccess: (agentId, user) => deps.resolveAgentFireAccess(agentId, user),
    resolveFiles: async (fileIds, user) => {
      const files = await methods.getFiles(
        { file_id: { $in: fileIds }, user: user.id },
        null,
        '-text',
      );
      return (files ?? []).map((file) => ({
        file_id: file.file_id,
        filepath: file.filepath,
        filename: file.filename,
        type: file.type,
        height: file.height,
        width: file.width,
        source: file.source,
      }));
    },
    mintFireToken: (userId) =>
      generateShortLivedToken(userId, SCHEDULE_FIRE_TOKEN_TTL, { scope: SCHEDULE_FIRE_SCOPE }),
    getSelfUrl: () =>
      process.env.SCHEDULES_SELF_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3080}`,
    runInTenantContext: (user, fn) =>
      tenantStorage.run({ tenantId: user.tenantId, userId: user.id }, fn),
    getJobStatus: async (conversationId) => {
      const job = await GenerationJobManager.getJobStore()?.getJob(conversationId);
      if (job == null) {
        return null;
      }
      return { status: job.status, scheduleId: job.scheduleId, scheduledFor: job.scheduledFor };
    },
    abortScheduledJob: async (conversationId, identity, options) => {
      const store = GenerationJobManager.getJobStore();
      if (store == null) {
        return false;
      }
      const job = await store.getJob(conversationId);
      // A null/identity-mismatched job is NOT reachable from this replica: it may be
      // a live generation on a peer worker's private in-memory store (unshared
      // topology). Report false so the caller knows the abort was NOT delivered.
      if (job == null || !jobMatchesIdentity(job, identity)) {
        return false;
      }
      // Already terminal — the run is no longer generating. For a per-schedule delete
      // (preserve) leave the job as reconcile evidence; for account deletion
      // (preserve:false) this may be a PRESERVED terminal job from a prior failed
      // outcome write, and since its ScheduleRun rows are about to be hard-deleted no
      // reconciler will ever clear it — delete it now so the job hash doesn't leak.
      if (job.status !== 'running' && job.status !== 'requires_action') {
        if (options?.preserve === false) {
          await store.deleteJob(conversationId);
        }
        return true;
      }
      await GenerationJobManager.abortJob(conversationId, {
        preserveForReconcile: options?.preserve ?? true,
      });
      return true;
    },
    clearReconciledJob: async (conversationId, identity) => {
      const store = GenerationJobManager.getJobStore();
      if (store == null) {
        return;
      }
      const job = await store.getJob(conversationId);
      // Only delete when the job still carries THIS run's identity, so a
      // replacement generation occupying the same conversationId is never destroyed.
      if (job == null || !jobMatchesIdentity(job, identity)) {
        return;
      }
      await store.deleteJob(conversationId);
    },
    // Whether every engine replica observes the SAME jobs: a Redis-backed job
    // store is shared across workers, and a single-process (non-clustered)
    // deployment sees all its own jobs. Only a CLUSTERED in-memory store (each
    // worker private) is unshared — and would wrongly reap a peer's live run.
    // Read live so a stream-store that fell back to in-memory is reflected.
    isJobStoreShared: () => GenerationJobManager.isRedis || !clustered,
    // Counted in system scope so the cap is GLOBAL — a per-owner (tenant-scoped)
    // count would let multiple tenants collectively exceed fireConcurrency.
    countActiveRunsGlobal: () => runAsSystem(() => methods.countActiveRuns()),
  };

  let engine: ReturnType<typeof startScheduleEngine> | undefined;

  async function initializeScheduleEngine(options?: {
    clustered?: boolean;
  }): Promise<ReturnType<typeof startScheduleEngine> | undefined> {
    if (engine != null) {
      return engine;
    }
    // A clustered deployment (multiple replicas) that is NOT Redis-backed has
    // private per-worker job stores, so isJobStoreShared reads false and the
    // reconciler skips cross-worker orphan reaping it can't trust.
    if (options?.clustered != null) {
      clustered = options.clustered;
    }
    // A clustered deployment without a SHARED stream backend cannot signal a peer
    // worker's in-memory job (emitAbort is cross-replica only over Redis), so
    // deletion quiescing can't abort a scheduled run whose generation lives on
    // another worker, and orphan reaping is disabled. This is unsupported for
    // scheduled chats — warn the operator to enable USE_REDIS_STREAMS.
    if (clustered && !GenerationJobManager.isRedis) {
      logger.warn(
        '[schedules] clustered deployment without a shared stream store (USE_REDIS_STREAMS): ' +
          'scheduled-run peer aborts (deletion/account-deletion quiescing) and cross-worker ' +
          'orphan recovery are NOT available. Enable USE_REDIS_STREAMS for safe multi-worker scheduling.',
      );
    }
    // Explicitly build the Schedule/ScheduleRun indexes first — the unique
    // idempotency index and TTL retention index would otherwise never exist when
    // MONGO_AUTO_INDEX is disabled (the production default). If this fails the
    // unique {scheduleId, scheduledFor} guard may be absent, so leave the engine
    // DISABLED rather than firing without duplicate protection — the app still
    // runs; schedules simply don't fire until an operator resolves the index.
    try {
      await runAsSystem(() => methods.ensureScheduleIndexes());
    } catch (err) {
      logger.error(
        '[schedules] index creation failed — scheduler NOT started (fires need the unique idempotency index):',
        err,
      );
      return undefined;
    }
    engine = startScheduleEngine(engineDeps);
    return engine;
  }

  /**
   * Manual run-now fire. Acquires the schedule lease to serialize concurrent
   * run-now clicks (and to block against a background engine claim), then fires
   * in manual mode so the next automatic occurrence is left untouched. Returns
   * null when the lease is already held (a run is in progress).
   */
  async function fireScheduleNow(
    schedule: FireableSchedule,
    limits: ScheduleLimits,
  ): Promise<FireResult | null> {
    const leased = await methods.acquireManualRunLease(
      schedule.id,
      schedule.user,
      MANUAL_RUN_LEASE_MS,
    );
    if (leased == null) {
      return null;
    }
    const claimToken = leased.claimToken;
    try {
      // Fire the FRESH leased row (post-image with the new claim token), not the
      // snapshot the route read before the lease — an edit that committed in the
      // window in between is reflected, so a stale prompt/agent is never dispatched.
      return await fireSchedule(engineDeps, leased, limits, new Date(), { manual: true });
    } catch (err) {
      if (claimToken != null) {
        await methods.releaseLease(schedule.id, claimToken).catch(() => undefined);
      }
      throw err;
    }
  }

  const OUTCOME_RETRY_ATTEMPTS = 3;

  /**
   * Completion hook: called from the agents controller finalize paths when the
   * request carried a scheduleId. The caller deletes the job (`completeJob`) right
   * after, destroying the only evidence the reconciler could use — so a transient
   * Mongo failure here is RETRIED (bounded) before giving up, and the failure is
   * surfaced to the caller (returns false) so it can keep the job when it matters.
   */
  async function recordScheduleOutcome({
    scheduleId,
    scheduledFor,
    status,
    conversationId,
    error,
  }: RecordScheduleOutcomeInput): Promise<boolean> {
    if (!scheduleId || !scheduledFor) {
      return true;
    }
    for (let attempt = 1; attempt <= OUTCOME_RETRY_ATTEMPTS; attempt++) {
      try {
        // Resolve the owner's limits so auto-disable uses the same per-principal
        // threshold as the fire path (not the global default).
        const schedule = await methods.getScheduleById(scheduleId);
        const owner = schedule ? await engineDeps.getUserContext(schedule.user) : null;
        const limits = await getLimits(owner ?? undefined);
        await methods.recordRunOutcome({
          scheduleId,
          scheduledFor: new Date(scheduledFor),
          status,
          conversationId,
          error,
          autoDisableAfterFailures: limits.autoDisableAfterFailures,
        });
        return true;
      } catch (err) {
        logger.error(
          `[schedules] failed to record run outcome (attempt ${attempt}/${OUTCOME_RETRY_ATTEMPTS}):`,
          err,
        );
      }
    }
    return false;
  }

  async function isScheduleLive(scheduleId: string): Promise<boolean> {
    if (!scheduleId) {
      return false;
    }
    return (await methods.getScheduleById(scheduleId)) != null;
  }

  /**
   * Reservation for a HITL resume, run BEFORE the approval claim so a deferral
   * leaves the approval claimable. Checks existence/overlap/capacity READ-ONLY
   * first (a null schedule -> 'gone'; another `started` occurrence -> 'overlap'; the
   * owner's fireConcurrency saturated -> 'capacity'), then promotes the run into the
   * single active slot WITHOUT any rollback. No rollback is the key correctness
   * property: whichever request wins the approval drives whatever is `started`, so a
   * losing racer can never flip the winner's active row back to requires_action.
   * Per-schedule overlap is hard-enforced by the partial unique index; the global
   * cap is a best-effort soft cap here (concurrent resumes of DIFFERENT schedules
   * can transiently overshoot by the number racing, self-healing when they settle) —
   * the fire path remains the hard-enforced cap for new load, and enforcing it
   * atomically here would require either a rollback that races the claim takeover or
   * a drift-prone global counter.
   */
  async function reserveScheduledResume(
    scheduleId: string,
    scheduledFor: string | Date,
  ): Promise<ResumeCheck> {
    if (!scheduleId || !scheduledFor) {
      return 'ok';
    }
    // getScheduleById hides deleted/soft-deleted schedules, so a null here means the
    // owner already deleted the schedule — its paused run must not be resumable even
    // if the delete's best-effort abort raced. Reject before touching the run.
    const schedule = await methods.getScheduleById(scheduleId);
    if (schedule == null) {
      return 'gone';
    }
    const when = new Date(scheduledFor);
    // Overlap = a DIFFERENT occurrence is currently `started`. Exclude this run's own
    // row: if its pause bookkeeping failed transiently the row can still be `started`,
    // and treating that as an overlap would wrongly reject resuming THIS same occurrence.
    if (await methods.hasOtherActiveRun(scheduleId, when)) {
      return 'overlap';
    }
    // Read-only capacity gate BEFORE promoting, so we never mutate a row a concurrent
    // same-pause resume may already be driving (no rollback path exists). Discount
    // this occurrence's OWN `started` row when present (a transient pause-bookkeeping
    // failure): resuming it adds no new active run, so the global count already
    // includes it and must not block the resume.
    const owner = await engineDeps.getUserContext(schedule.user);
    const limits = await getLimits(owner ?? undefined);
    const selfActive = await methods.isOccurrenceStarted(scheduleId, when);
    if (!selfActive && (await engineDeps.countActiveRunsGlobal()) >= limits.fireConcurrency) {
      return 'capacity';
    }
    // Reserve the single active slot. If a different occurrence won the slot since
    // the read-only check above, promoteRunToStarted returns 'overlap' — defer the
    // resume (approval stays claimable) rather than running a second concurrent
    // occurrence with the paused row still `requires_action` (which overlap/capacity
    // accounting would miss). 'missing' means a concurrent same-pause resume already
    // promoted it — proceed. Never rolled back.
    const promoted = await methods.promoteRunToStarted(scheduleId, when);
    if (promoted === 'overlap') {
      return 'overlap';
    }
    return 'ok';
  }

  /** Aborts an active run's loopback job (identity-guarded). Returns whether the
   * abort was delivered (false when the job wasn't reachable — e.g. a peer worker's
   * private store, or a transient error). */
  async function abortActiveRun(
    run: { scheduleId: string; scheduledFor: Date; conversationId?: string },
    preserve: boolean,
  ): Promise<boolean> {
    if (!run.conversationId) {
      return false;
    }
    return engineDeps
      .abortScheduledJob(
        run.conversationId,
        { scheduleId: run.scheduleId, scheduledFor: run.scheduledFor },
        { preserve },
      )
      .catch((err) => {
        logger.warn('[schedules] failed to abort run job on quiesce:', err);
        return false;
      });
  }

  /** Resolve the owner's durable-checkpointer config (in their tenant context) so a
   *  paused-run checkpoint can be pruned on delete, mirroring the interactive abort. */
  async function resolveOwnerCheckpointer(
    ownerId: string | Types.ObjectId,
  ): Promise<TCheckpointerConfig | undefined> {
    const owner = await engineDeps.getUserContext(ownerId);
    if (owner == null) {
      return undefined;
    }
    const appConfig = await engineDeps.runInTenantContext(owner, () =>
      deps.getAppConfig(getAppConfigOptionsFromUser(owner)),
    );
    return appConfig?.endpoints?.agents?.checkpointer;
  }

  /**
   * Soft-deletes a schedule for its owner: disables + marks it `deleting` (so the
   * engine can no longer claim it and it disappears from the owner's list), rotates
   * the claim token to fence any in-flight worker, aborts the loopback jobs of its
   * active runs (evidence preserved for the reconciler), and erases immediately
   * when already drained. Any still-active runs are erased by the reconciler once
   * they settle. Returns false when the schedule doesn't exist / already deleting.
   */
  async function deleteScheduleForOwner(scheduleId: string, userId: string): Promise<boolean> {
    const schedule = await methods.markScheduleDeleting(scheduleId, userId);
    if (schedule == null) {
      return false;
    }
    const active = await methods.getActiveRunsForSchedule(scheduleId);
    // Resolve the checkpointer config once (only when a paused run needs pruning) in
    // the owner's tenant context, matching the interactive abort endpoint's prune.
    const hasPausedRun = active.some(
      (run) => run.status === 'requires_action' && run.conversationId != null,
    );
    const checkpointer = hasPausedRun ? await resolveOwnerCheckpointer(schedule.user) : undefined;
    for (const run of active) {
      // Preserve the aborted job for the reconciler: the run row survives (erase
      // waits for it to drain), so reconcile finalizes it and clears the job.
      await abortActiveRun(run, true);
      // HITL: prune the durable checkpoint of a run aborted while paused so a new turn
      // in this conversation can't rehydrate the stale interrupt before the Mongo TTL
      // reclaims it (thread_id === conversationId). Idempotent / no-op otherwise.
      if (run.status === 'requires_action' && run.conversationId) {
        await deleteAgentCheckpoint(run.conversationId, checkpointer).catch(() => undefined);
      }
    }
    await methods.eraseScheduleIfDrained(scheduleId).catch(() => undefined);
    return true;
  }

  /**
   * Quiesces every schedule of a user ahead of account deletion: marks them all
   * non-claimable (so no new occurrence fires while the cascade runs) and aborts
   * the loopback jobs of any in-flight runs, so a scheduled generation cannot keep
   * persisting messages after the account's messages/conversations are deleted.
   */
  async function quiesceUserSchedules(userId: string): Promise<void> {
    await methods.disableUserSchedulesForDeletion(userId);
    const active = await methods.getActiveRunsForUser(userId);
    const unconfirmed: string[] = [];
    for (const run of active) {
      // Do NOT preserve for reconcile: account deletion hard-deletes these run
      // rows, so no reconcile pass will ever finalize/clear a retained job — a
      // preserved job would leak in the store. Let the abort settle it directly.
      const aborted = await abortActiveRun(run, false);
      if (!aborted && run.conversationId) {
        unconfirmed.push(run.conversationId);
      }
    }
    // WAIT (bounded) for the aborted generations to actually settle before the
    // account-deletion cascade deletes messages/conversations: a run that already
    // returned from the model can observe the abort but still persist its messages,
    // which would otherwise resurrect data for the deleted account after the cascade
    // ran. Poll the run rows (they leave the active set once their outcome is
    // recorded) until drained or the deadline.
    const deadline = Date.now() + QUIESCE_DRAIN_TIMEOUT_MS;
    let remaining = active.length;
    while (remaining > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, QUIESCE_DRAIN_POLL_MS));
      remaining = (await methods.getActiveRunsForUser(userId)).length;
    }
    // Surface anything that did not drain / could not be confirmed: in a clustered
    // deployment without a shared stream store the run's generation may live on a
    // peer worker and keep persisting for the now-deleted account. Known unshared-
    // topology limitation (see the init warning); make it visible.
    if (remaining > 0 || unconfirmed.length > 0) {
      logger.warn(
        `[schedules] account-deletion quiesce did not confirm ${Math.max(remaining, unconfirmed.length)} ` +
          `in-flight scheduled run(s) settled${unconfirmed.length ? ` [${unconfirmed.join(', ')}]` : ''} ` +
          '— a peer worker generation may still persist data. Guaranteed quiescing requires a ' +
          'shared stream store (USE_REDIS_STREAMS).',
      );
    }
  }

  return {
    getLimits,
    engineDeps,
    fireScheduleNow,
    recordScheduleOutcome,
    isScheduleLive,
    reserveScheduledResume,
    deleteScheduleForOwner,
    quiesceUserSchedules,
    initializeScheduleEngine,
  };
}
