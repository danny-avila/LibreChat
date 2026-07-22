import { logger, runAsSystem, tenantStorage } from '@librechat/data-schemas';
import { getRefillEligibilityDate, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { ScheduleMethods, AppConfig, IBalance } from '@librechat/data-schemas';
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
import { fireSchedule, SCHEDULE_FIRE_TOKEN_TTL } from './fire';
import { getAppConfigOptionsFromUser } from '../app/service';
import { DEFAULT_SCHEDULE_LIMITS } from './types';
import { getBalanceConfig } from '../app/config';
import { startScheduleEngine } from './engine';

/** Recordable terminal/paused run outcome, as accepted by `recordRunOutcome`. */
type ScheduleRunOutcomeStatus = Parameters<ScheduleMethods['recordRunOutcome']>[0]['status'];

/**
 * Outcome of atomically reserving the active slot for a HITL resume.
 * - `reserved`: this caller promoted the run to `started` and OWNS the slot (it
 *   must release on a subsequent failure/lost approval claim).
 * - `noop`: proceed, but this caller did not promote (row already active/terminal),
 *   so it must NOT release — a concurrent same-pause resume owns it.
 * - `overlap` / `capacity`: defer the resume (approval left unconsumed).
 */
export type ResumeReservation = 'reserved' | 'noop' | 'overlap' | 'capacity';

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
   * Atomically reserves the single active slot for a HITL resume BEFORE the
   * approval is consumed: promotes the paused run to `started` (the partial unique
   * index makes per-schedule overlap atomic) and verifies global fireConcurrency.
   * Returns 'overlap'/'capacity' when the resume must defer (approval untouched).
   */
  reserveScheduledResume: (
    scheduleId: string,
    scheduledFor: string | Date,
  ) => Promise<ResumeReservation>;
  /** Releases a resume reservation (rolls `started` back to `requires_action`). */
  releaseScheduledResume: (scheduleId: string, scheduledFor: string | Date) => Promise<void>;
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
    abortScheduledJob: async (conversationId, identity) => {
      const store = GenerationJobManager.getJobStore();
      if (store == null) {
        return;
      }
      const job = await store.getJob(conversationId);
      // Identity guard: never abort a replacement turn that reused the
      // conversationId, and never re-terminalize (clobber) an already-settled
      // job — its evidence must survive for the reconciler.
      if (job == null || !jobMatchesIdentity(job, identity)) {
        return;
      }
      if (job.status !== 'running' && job.status !== 'requires_action') {
        return;
      }
      await GenerationJobManager.abortJob(conversationId, { preserveForReconcile: true });
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
    const claimToken = await methods.acquireManualRunLease(
      schedule.id,
      schedule.user,
      MANUAL_RUN_LEASE_MS,
    );
    if (claimToken == null) {
      return null;
    }
    try {
      // Carry the fresh claim token so the manual fire's lease release is fenced.
      return await fireSchedule(engineDeps, { ...schedule, claimToken }, limits, new Date(), {
        manual: true,
      });
    } catch (err) {
      await methods.releaseLease(schedule.id, claimToken).catch(() => undefined);
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

  /**
   * Atomically reserves the schedule's single active slot for a HITL resume,
   * called BEFORE the approval is consumed so a lost reservation leaves the
   * approval claimable. Promotes the paused run `requires_action -> started`; the
   * single-active partial index makes per-schedule overlap atomic (a newer
   * occurrence already active -> 'overlap'). Then reserve-then-verifies the global
   * fireConcurrency cap against the OWNER's limit, rolling back on 'capacity'. A
   * row that is no longer `requires_action` ('missing') is treated as 'ok' so a
   * legitimate resume is never blocked on stale run-row bookkeeping.
   */
  async function reserveScheduledResume(
    scheduleId: string,
    scheduledFor: string | Date,
  ): Promise<ResumeReservation> {
    if (!scheduleId || !scheduledFor) {
      return 'noop';
    }
    const when = new Date(scheduledFor);
    const promoted = await methods.promoteRunToStarted(scheduleId, when);
    if (promoted === 'overlap') {
      return 'overlap';
    }
    // A row that is no longer `requires_action` ('missing') is already active
    // (a concurrent same-pause resume promoted it) or terminal — proceed without
    // owning the slot so we never release a slot we didn't reserve.
    if (promoted === 'missing') {
      return 'noop';
    }
    const schedule = await methods.getScheduleById(scheduleId);
    const owner = schedule ? await engineDeps.getUserContext(schedule.user) : null;
    const limits = await getLimits(owner ?? undefined);
    const active = await engineDeps.countActiveRunsGlobal();
    if (active > limits.fireConcurrency) {
      await methods
        .transitionRunStatus(scheduleId, when, 'started', 'requires_action')
        .catch(() => undefined);
      return 'capacity';
    }
    return 'reserved';
  }

  async function releaseScheduledResume(
    scheduleId: string,
    scheduledFor: string | Date,
  ): Promise<void> {
    if (!scheduleId || !scheduledFor) {
      return;
    }
    try {
      await methods.transitionRunStatus(
        scheduleId,
        new Date(scheduledFor),
        'started',
        'requires_action',
      );
    } catch (err) {
      logger.error('[schedules] failed to release resume reservation:', err);
    }
  }

  /** Aborts an active run's loopback job (identity-guarded, evidence-preserving). */
  async function abortActiveRun(run: {
    scheduleId: string;
    scheduledFor: Date;
    conversationId?: string;
  }): Promise<void> {
    if (!run.conversationId) {
      return;
    }
    await engineDeps
      .abortScheduledJob(run.conversationId, {
        scheduleId: run.scheduleId,
        scheduledFor: run.scheduledFor,
      })
      .catch((err) => logger.warn('[schedules] failed to abort run job on quiesce:', err));
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
    for (const run of active) {
      await abortActiveRun(run);
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
    for (const run of active) {
      await abortActiveRun(run);
    }
  }

  return {
    getLimits,
    engineDeps,
    fireScheduleNow,
    recordScheduleOutcome,
    reserveScheduledResume,
    releaseScheduledResume,
    deleteScheduleForOwner,
    quiesceUserSchedules,
    initializeScheduleEngine,
  };
}
