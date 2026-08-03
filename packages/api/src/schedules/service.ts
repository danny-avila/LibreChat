import { logger, runAsSystem, tenantStorage, isRuntimeDisabled } from '@librechat/data-schemas';
import { getRefillEligibilityDate, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { ScheduleMethods, AppConfig, IBalance } from '@librechat/data-schemas';
import type { TCheckpointerConfig } from 'librechat-data-provider';
import type { AddressInfo } from 'net';
import type { Types } from 'mongoose';
import type {
  ScheduleEngineDeps,
  ScheduleDeleteResult,
  ScheduleLimits,
  ScheduleUserContext,
  FireableSchedule,
  FireResult,
  JobIdentity,
} from './types';
import type { SerializableJobData } from '../stream/interfaces/IJobStore';
import type { BalanceUpdateFields } from '../types/balance';
import type { GetAppConfigOptions } from '../app/service';
import {
  DEFAULT_SCHEDULE_LIMITS,
  SCHEDULE_FILE_HOLD,
  hasResumeHandoffInFlight,
  hasAbortInFlight,
} from './types';
import { generateShortLivedToken, SCHEDULE_FIRE_SCOPE, SCHEDULE_MANUAL_CLAIM } from '../crypto/jwt';
import { deleteAgentCheckpoint, captureAgentCheckpointGeneration } from '../agents/checkpointer';
import { fireSchedule, SCHEDULE_FIRE_TOKEN_TTL, BALANCE_SKIP_DISABLE_THRESHOLD } from './fire';
import { GenerationJobManager } from '../stream/GenerationJobManager';
import { buildBalanceUpdateFields } from '../middleware/balance';
import { getAppConfigOptionsFromUser } from '../app/service';
import { isShutdownInProgress } from '../app/shutdown';
import { startScheduleErasureSweep } from './erasure';
import { getBalanceConfig } from '../app/config';
import { selfOriginFromAddress } from './origin';
import { startScheduleEngine } from './engine';
import { withCapacitySlot } from './capacity';
import { isEnabled } from '../utils/common';

/** Recordable terminal/paused run outcome, as accepted by `recordRunOutcome`. */
type ScheduleRunOutcomeStatus = Parameters<ScheduleMethods['recordRunOutcome']>[0]['status'];

/** How a TERMINAL job status projects onto its run row. Mirrors the reconciler's
 *  mapping, so a run settled from a retained job reads the same either way. */
const TERMINAL_JOB_OUTCOMES: Record<string, ScheduleRunOutcomeStatus | undefined> = {
  complete: 'success',
  error: 'error',
  aborted: 'interrupted',
};

/** Reason text recorded when account-deletion quiesce settles a run itself. */
const QUIESCE_SETTLE_ERRORS: Partial<Record<ScheduleRunOutcomeStatus, string>> = {
  interrupted: 'Account deleted while awaiting approval',
  error: 'Run ended in error',
};

/**
 * Whether this process may arm the scheduler at all.
 *
 * v1 is single-process by design, but the standard entrypoint runs
 * `initializeScheduleEngine` in EVERY replica and nothing stops an operator from scaling
 * it. That is only safe when replicas can see each other's generations: a shared stream
 * store (Redis) gives every replica the same job view, so reconciliation and
 * deletion-time aborts reach the run's real owner. With the process-local store a peer
 * sees the globally visible `started` row but no job, and after the orphan cutoff it
 * marks a still-running generation interrupted and frees its capacity slot.
 *
 * A single replica with the in-memory store is perfectly safe, but a process cannot
 * observe its own replica count, so that case needs an explicit operator assertion.
 */
function isTopologySafeToArm(): boolean {
  return GenerationJobManager.isRedis || isEnabled(process.env.SCHEDULES_SINGLE_PROCESS);
}

/** Whether a persisted job still carries a given scheduled occurrence's identity. */
function jobMatchesIdentity(
  job: Pick<SerializableJobData, 'scheduleId' | 'scheduledFor'>,
  identity: JobIdentity,
): boolean {
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
  /** Erase the row's reserved conversationId (pre-start abort: no conversation exists). */
  clearConversationId?: boolean;
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
    /** Owner-scoped bounded TTL hold (`db.extendFilesTTL`-shaped). */
    extendFilesTTL: (
      fileIds: string[],
      hold: { renewMs: number; maxLifetimeMs: number },
      owner: { user: string; tenantId?: string | null },
    ) => Promise<number>;
  };
  getAppConfig: (options?: GetAppConfigOptions) => Promise<AppConfig | undefined>;
  findUserById: (
    userId: string | Types.ObjectId,
  ) => Promise<{ _id: Types.ObjectId; tenantId?: string; role?: string } | null>;
  findBalance: (userId: string) => Promise<IBalance | null>;
  /**
   * Upserts a balance record. `setOnInsert` carries fields that must ONLY apply to a
   * document this call creates — chiefly the starting credit — so a record created by a
   * concurrent charge is never overwritten with a fresh balance.
   */
  upsertBalance: (
    userId: string,
    update: { set: Partial<BalanceUpdateFields>; setOnInsert: Partial<BalanceUpdateFields> },
  ) => Promise<IBalance | null>;
  resolveAgentFireAccess: (
    agentId: string,
    user: ScheduleUserContext,
  ) => Promise<'ok' | 'missing' | 'forbidden'>;
  /** Whether this user's account deletion has begun. Fail-closed (unknown == true). */
  isUserDeleting: (userId: string) => Promise<boolean>;
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
   * Stamps a run abort-requested (source: the interactive Stop route) ahead of an
   * abort this service does not signal. 'stamped' means the fence is durable and the
   * abort may proceed; 'no_active_run' means the occurrence is already settled (no
   * fence needed, nothing to settle); 'failed' means the stamp could not be made
   * durable and the abort must NOT proceed — without it a concurrent
   * account-deletion quiesce would read the post-abort job state as a settled
   * generation and confirm its drain mid-write.
   */
  requestScheduledRunAbort: (
    scheduleId: string,
    scheduledFor: Date,
  ) => Promise<'stamped' | 'no_active_run' | 'in_progress' | 'failed'>;
  /**
   * Stamped by the interactive Stop route once every write it makes (checkpoint prune,
   * partial-response save) has landed; releases the generation owner's settlement
   * barrier (see awaitStopAbortPersistence).
   */
  /** Stamps a paused run resume-claimed (re-pause hand-off fence). Best-effort. */
  markScheduledRunResumeClaimed: (scheduleId: string, scheduledFor: Date) => Promise<void>;
  markScheduledRunAbortPersisted: (scheduleId: string, scheduledFor: Date) => Promise<void>;
  /**
   * The generation owner's half of the abort-settlement barrier: when THIS run's abort
   * came from the interactive Stop route (`abortSource: 'stop'`, stamped before the
   * abort was signalled), waits — bounded — for the route to stamp
   * `abortPersistedAt`, i.e. for its checkpoint prune and partial-response save to
   * land. Settling before that lets the run leave the active set while the route is
   * still persisting, so an account-deletion drain can confirm mid-write.
   *
   * FAILS CLOSED: returns true only when the barrier is genuinely clear (no stop
   * attempt pending, or its persistence acknowledged, or the whole owner-death fence
   * has lapsed). On timeout or unreadable state it returns false, and the caller must
   * NOT settle — it leaves the run active for the reconciler, which finalizes it once
   * the fence expires. Trivially true for deletion-sourced aborts (nothing is
   * persisted after those) and for runs with no abort stamp.
   */
  awaitStopAbortPersistence: (scheduleId: string, scheduledFor: Date) => Promise<boolean>;
  /**
   * Whether a schedule is still live (exists and not soft-deleted). The loopback
   * chat controller calls this right after creating the generation job to re-fence
   * a fire against a delete/quiesce that landed in the claim -> POST window (when
   * the reservation row exists but the job did not yet, so the deletion's abort
   * missed it) — aborting before any messages are persisted.
   */
  isScheduleLive: (
    scheduleId: string,
    expectedConfigRevision?: number,
    options?: { automatic?: boolean; policy?: boolean },
  ) => Promise<boolean>;
  /** Soft-deletes an owner's schedule: stop claims, abort active runs, drain, erase. */
  deleteScheduleForOwner: (scheduleId: string, userId: string) => Promise<ScheduleDeleteResult>;
  /**
   * Quiesces all of a user's schedules ahead of account deletion (stop + abort + drain).
   * Returns whether the drain was CONFIRMED: false means at least one run could not be
   * confirmed settled, and the caller must NOT proceed to destructive deletion — the
   * durable barrier keeps refusing new work while a later pass finishes the cascade.
   */
  quiesceUserSchedules: (userId: string) => Promise<boolean>;
  /** Arms the scheduler for THIS process. v1 is single-process only; the clustered
   *  entrypoint does not start it. Returns undefined when index creation failed, or when
   *  the topology cannot be shown safe (process-local job store with no single-process
   *  assertion) — see isTopologySafeToArm. */
  initializeScheduleEngine: (
    options?: ScheduleEngineInitOptions,
  ) => Promise<ReturnType<typeof startScheduleEngine> | undefined>;
}

export interface ScheduleEngineInitOptions {
  /** The listener's own `server.address()`; see selfOriginFromAddress. */
  address?: AddressInfo | string | null;
}

/** Test-only overrides for the service's bounded waits (drains, barriers). */
export interface ScheduleServiceTimings {
  drainTimeoutMs?: number;
  drainPollMs?: number;
  stopBarrierTimeoutMs?: number;
  stopBarrierPollMs?: number;
}

/**
 * Builds the scheduler service around api-side dependencies. Each call owns its
 * own engine singleton and job-store-shared flag, so state never leaks between
 * instances.
 */
export function createSchedulesService(
  deps: SchedulesServiceDeps,
  timings?: ScheduleServiceTimings,
): SchedulesService {
  const { methods } = deps;

  /** Resolved from the listener at arm time; see getSelfUrl. */
  let boundOrigin: string | undefined;

  // Fail LOUDLY at construction, not per-fire. The JS adapter (api/server/services/
  // Schedules) is not typechecked against SchedulesServiceDeps, so a missing dep would
  // otherwise surface only as a `deps.X is not a function` deep inside a live fire —
  // which is exactly how the deletion-barrier probe shipped unwired twice.
  const REQUIRED_DEPS: Array<keyof SchedulesServiceDeps> = [
    'methods',
    'getAppConfig',
    'findUserById',
    'findBalance',
    'upsertBalance',
    'resolveAgentFireAccess',
    'isUserDeleting',
  ];
  for (const key of REQUIRED_DEPS) {
    if (deps[key] == null) {
      throw new Error(`createSchedulesService: missing required dependency "${key}"`);
    }
  }

  /**
   * Resolves schedule limits, honoring per-principal (role/user) config overrides
   * when a user is supplied (routes pass req.user, the fire path passes the owner).
   */
  async function getLimits(user?: ScheduleUserContext): Promise<ScheduleLimits> {
    // The BASE `interface.schedules: false` is a global stop and must win over any
    // principal override. Without this a tenant/role/user override resolving to
    // enabled would let the sidebar and CRUD handlers admit schedules that
    // isGloballyDisabled() correctly refuses to ever fire.
    if (
      user != null &&
      (await deps.getAppConfig({ baseOnly: true }))?.interfaceConfig?.schedules === false
    ) {
      return { ...DEFAULT_SCHEDULE_LIMITS, enabled: false };
    }
    // NO principal means the DEPLOYMENT's config, so it must be read base-only. A bare
    // getAppConfig() still resolves principals and picks up the tenant from the ALS
    // context, and both callers of this form run inside one: fireSchedule clamps the
    // global capacity allocator from within runInTenantContext(owner), and the engine
    // tick budgets from within runAsSystem. Either would otherwise resolve a TENANT
    // override as if it were the deployment-wide value, which is exactly what the
    // global cap exists to prevent an override from widening.
    const appConfig = user
      ? await deps.getAppConfig(getAppConfigOptionsFromUser(user))
      : await deps.getAppConfig({ baseOnly: true });
    // The env kill switch is a GLOBAL stop and must be visible everywhere limits are
    // consulted (write handlers, fire path), not only at the engine tick.
    if (isEnabled(process.env.SCHEDULES_DISABLED)) {
      return { ...DEFAULT_SCHEDULE_LIMITS, enabled: false };
    }
    const config = appConfig?.interfaceConfig?.schedules;
    // EXPERIMENTAL, default-OFF (v1): scheduled chats are disabled unless an admin
    // explicitly enables them. Absence, null, or `false` all resolve to disabled, so a
    // deployment that never opts in never runs the scheduler. `true` uses the defaults;
    // an object opts in unless it sets `use: false`.
    if (config == null || config === false) {
      return { ...DEFAULT_SCHEDULE_LIMITS, enabled: false };
    }
    if (config === true) {
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
  const QUIESCE_DRAIN_TIMEOUT_MS = timings?.drainTimeoutMs ?? 10 * 1000;
  const QUIESCE_DRAIN_POLL_MS = timings?.drainPollMs ?? 250;

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
    // On the BASE deps, not only the engine's per-pass wrapper: fireScheduleNow
    // (manual Run Now) dispatches with these deps directly, and its POST must be
    // gated by the same coordinator signal as the engine tick's.
    isShuttingDown: isShutdownInProgress,
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
          // The read above and this write are separate statements, and the credit
          // fields are INITIALIZATION values: a concurrent charge that created the
          // record in between would be overwritten by a blind `$set`, restoring credits
          // the user had already spent. Route those through `$setOnInsert` so they only
          // apply to a document this call actually creates. The refill-config fields are
          // a genuine sync and stay on `$set`.
          //
          // Only when the record was ABSENT: an existing record with a null
          // tokenCredits has no charge to clobber, so initializing it via `$set` is
          // both safe and necessary (`$setOnInsert` would never fire for it).
          const { user: initUser, tokenCredits, ...syncFields } = updateFields;
          const setOnInsert =
            record == null
              ? {
                  ...(initUser != null ? { user: initUser } : {}),
                  ...(tokenCredits != null ? { tokenCredits } : {}),
                }
              : {};
          const set = record == null ? syncFields : updateFields;
          record = await deps.upsertBalance(user.id, { set, setOnInsert });
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
      // Renew the bounded upload hold at every fire preflight, BEST-EFFORT: the hold
      // only has to bridge upload -> first consumption (a real send clears the TTL
      // permanently), and a failed renewal must not fail the fire — at worst the hold
      // lapses later and resolveFiles drops the reaped file (droppedFileIds records it).
      await methods
        .extendFilesTTL(fileIds, SCHEDULE_FILE_HOLD, { user: user.id, tenantId: user.tenantId })
        .catch((err) => logger.warn('[schedules] attachment hold renewal failed:', err));
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
    mintFireToken: (userId, options) =>
      generateShortLivedToken(userId, SCHEDULE_FIRE_TOKEN_TTL, {
        scope: SCHEDULE_FIRE_SCOPE,
        // Signed, so the limiter can trust it: Run Now must not inherit the automatic
        // occurrence's exemption from the interactive message limiters.
        ...(options?.manual ? { [SCHEDULE_MANUAL_CLAIM]: '1' } : {}),
      }),
    // Operator override first (a proxy/TLS front door), then the address the server
    // actually bound, and only then the historical guess.
    getSelfUrl: () =>
      process.env.SCHEDULES_SELF_URL ??
      boundOrigin ??
      `http://127.0.0.1:${process.env.PORT ?? 3080}`,
    runInTenantContext: (user, fn) =>
      tenantStorage.run({ tenantId: user.tenantId, userId: user.id }, fn),
    getJobStatus: async (conversationId) => {
      const job = await GenerationJobManager.getJobStore()?.getJob(conversationId);
      if (job == null) {
        return null;
      }
      return {
        status: job.status,
        scheduleId: job.scheduleId,
        scheduledFor: job.scheduledFor,
        createdEventEmitted: job.createdEventEmitted === true,
        ...(job.scheduleOutcome != null && { scheduleOutcome: job.scheduleOutcome }),
        ...(job.scheduleOutcomeError != null && {
          scheduleOutcomeError: job.scheduleOutcomeError,
        }),
      };
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
      // Already terminal — but `aborted` is NOT proof the stop was ever DELIVERED:
      // the first abort flips the job before its cross-replica publication, so a
      // failed publish leaves a peer generation running against a job every retry
      // reads as terminal. Trusting the status here returned "delivered" without
      // republishing, and after the owner-death fence lapsed the deletion path could
      // settle a run whose live generation then persisted post-cascade. RE-SIGNAL on
      // every retry instead; delivery stays ownership-honest, and the caller's
      // bounded drain confirms on the owner's settle once the signal actually lands.
      if (job.status === 'aborted') {
        const resignal = await GenerationJobManager.resignalAbort(
          conversationId,
          job.createdAt,
        ).catch((err) => {
          logger.warn('[schedules] failed to re-signal abort:', err);
          return { delivered: false, published: false };
        });
        if (options?.preserve === false && resignal.delivered) {
          // Only provably-quiet evidence is disposable (account deletion hard-deletes
          // the run rows, so nothing would ever clear this job later). Undelivered:
          // keep it — the drain stays unconfirmed and a later pass re-signals.
          await store.deleteJob(conversationId, job.createdAt);
        }
        return resignal.delivered;
      }
      // Finished naturally (`complete`/`error`): the generation persisted and stopped
      // on its own — nothing to signal. For a per-schedule delete (preserve) leave the
      // job as reconcile evidence; for account deletion (preserve:false) this may be a
      // PRESERVED terminal job from a prior failed outcome write, and since its
      // ScheduleRun rows are about to be hard-deleted no reconciler will ever clear
      // it — delete it now so the job hash doesn't leak.
      if (job.status !== 'running' && job.status !== 'requires_action') {
        if (options?.preserve === false) {
          // Generation-fenced for the same reason as clearReconciledJob: a replacement
          // may have claimed this conversationId since the read above.
          await store.deleteJob(conversationId, job.createdAt);
        }
        return true;
      }
      // Carry the stamp of the generation whose identity was just checked. The check
      // above and the abort's side effects are separated by awaits, so without this an
      // interactive turn replacing the job at this conversationId in that window would
      // receive the abort signal, terminal event and cleanup meant for the scheduled
      // run. A refused abort reports false, matching the unreachable-job case: the
      // caller learns the abort was not delivered rather than assuming it landed.
      const aborted = await GenerationJobManager.abortJob(conversationId, {
        preserveForReconcile: options?.preserve ?? true,
        expectedCreatedAt: job.createdAt,
      });
      // DELIVERED means a live generation actually received the stop, not merely that
      // the terminal CAS landed: a failed cross-replica publish leaves a peer worker
      // generating against a job that already reads `aborted`, and reporting that as
      // delivered would let a deletion drain confirm while it still persists.
      return aborted.success && aborted.signalDelivered !== false;
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
      // CAS, not read-then-delete: the identity check above is a READ, and a replacement
      // generation can land between it and the delete. Passing the observed createdAt
      // makes the delete conditional on the job still being that exact generation, so
      // the store itself rejects the write if one did.
      await store.deleteJob(conversationId, job.createdAt);
    },
    // Counted in system scope so the cap is GLOBAL — a per-owner (tenant-scoped)
    // count would let multiple tenants collectively exceed fireConcurrency.
    countActiveRunsGlobal: () => runAsSystem(() => methods.countActiveRuns()),
    isOwnerDeleting: (userId) => deps.isUserDeleting(userId),
    isGloballyDisabled: async () => {
      // Env first: an incident lever that must work even if the DB/config plane is the
      // thing failing (a kill switch that needs a healthy DB is the one that fails when
      // you need it).
      if (isEnabled(process.env.SCHEDULES_DISABLED)) {
        return true;
      }
      // BASE config only: DB principal overrides can narrow availability but must never
      // widen past an operator's global stop, so `schedules: false` in librechat.yaml is
      // genuinely non-overridable rather than emergent from the override filters.
      // isRuntimeDisabled reads BOTH stop shapes (`false` and `{ use: false }`) — the
      // same predicate the override merge preserves base stops with. A shape-blind
      // check here made the object form disable getLimits but not this gate, so the
      // engine kept claiming and fireSchedule ADVANCED each occurrence: a short
      // maintenance stop silently dropped every occurrence it covered instead of
      // leaving them due.
      const base = await deps.getAppConfig({ baseOnly: true });
      return isRuntimeDisabled(base?.interfaceConfig?.schedules);
    },
    // Occupancy is read in SYSTEM scope so the cap is global across tenants (the
    // owner's tenant context would only see its own runs); the claim itself stays in
    // the caller's context so the inserted row keeps correct tenant ownership.
    withGlobalCapacitySlot: (cap, claim) =>
      withCapacitySlot(cap, () => runAsSystem(() => methods.getCapacityOccupancy()), claim),
  };

  let engine: ReturnType<typeof startScheduleEngine> | undefined;
  let erasureSweep: ReturnType<typeof startScheduleErasureSweep> | undefined;

  /**
   * Fallback cleanup for a process whose engine refused to arm (unsafe topology, or
   * index creation failed): DELETE stays open on this entrypoint, so soft-deleted rows
   * still accrue — and with no reconciler, an owner-death case (account deletion begun
   * elsewhere, or a failed one-shot erase) would retain the hidden prompt forever.
   * The engine's own reconcile pass covers this when armed, so never run both.
   */
  function startErasureFallback(): void {
    if (erasureSweep != null || engine != null) {
      return;
    }
    erasureSweep = startScheduleErasureSweep({ methods, getJobStatus: engineDeps.getJobStatus });
  }

  async function initializeScheduleEngine(
    options?: ScheduleEngineInitOptions,
  ): Promise<ReturnType<typeof startScheduleEngine> | undefined> {
    // Resolve the loopback target BEFORE any early return: Run Now fires through the
    // same URL, and it must be right even on a process whose engine refused to arm.
    boundOrigin = selfOriginFromAddress(options?.address) ?? boundOrigin;
    if (engine != null) {
      return engine;
    }
    // Always arm. The engine owns BOTH firing and reconciliation, and reconciliation must
    // run even while firing is stopped: a previous process can leave `started` rows and
    // preserved terminal jobs that would otherwise never settle until scheduling is
    // re-enabled. Firing is gated separately — runTick refuses to claim while globally
    // disabled, and getLimits reports disabled to the write handlers and the fire path —
    // so "off" still means nothing fires, without stranding prior state.
    // Deliberately not gated on the base config either: schedules can be enabled for a
    // role/user/tenant while the base YAML stays default-off.
    // Explicitly build the Schedule/ScheduleRun indexes first — the unique
    // idempotency index and TTL retention index would otherwise never exist when
    // MONGO_AUTO_INDEX is disabled (the production default). If this fails the
    // unique {scheduleId, scheduledFor} guard may be absent, so leave the engine
    // DISABLED rather than firing without duplicate protection — the app still
    // runs; schedules simply don't fire until an operator resolves the index.
    if (!isTopologySafeToArm()) {
      logger.error(
        "[schedules] scheduler NOT started: this process cannot see other replicas' generations. " +
          'The job store is process-local (Redis is off), but nothing here proves this is the only ' +
          'replica — and the standard server arms the scheduler in EVERY replica. A peer would ' +
          'reconcile runs whose jobs it cannot see, eventually marking a still-running generation ' +
          'interrupted and releasing its capacity, and deletions routed elsewhere could not abort ' +
          'the generation at all. Enable a shared stream store (USE_REDIS_STREAMS), or set ' +
          'SCHEDULES_SINGLE_PROCESS=true to assert this deployment runs exactly one replica. ' +
          'Schedule writes are refused (503) until then.',
      );
      startErasureFallback();
      return undefined;
    }
    try {
      await runAsSystem(() => methods.ensureScheduleIndexes());
    } catch (err) {
      logger.error(
        '[schedules] index creation failed — scheduler NOT started (fires need the unique idempotency index):',
        err,
      );
      startErasureFallback();
      return undefined;
    }
    engine = startScheduleEngine(engineDeps);
    if (erasureSweep != null) {
      // A later successful arm supersedes the fallback: the engine's reconcile pass
      // owns erasure from here.
      erasureSweep.stop();
      erasureSweep = undefined;
    }
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
    // The global stop means STOP: a manual run dispatches the same billed generation as
    // an automatic one, so gating only the engine tick would leave Run Now wide open.
    if (await engineDeps.isGloballyDisabled()) {
      return { fired: false, skipped: 'disabled' as const };
    }
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
    clearConversationId,
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
          clearConversationId,
          conversationId,
          error,
          autoDisableAfterFailures: limits.autoDisableAfterFailures,
          balanceSkipDisableThreshold: BALANCE_SKIP_DISABLE_THRESHOLD,
        });
        // ERASE-ON-SETTLE: whichever process records a run's terminal outcome also
        // attempts the deferred erase of a deleting schedule. This is what makes a
        // delete's `draining` state converge in EVERY topology — the clustered
        // entrypoint runs no reconciler, so without this the hidden schedule (and its
        // prompt, which has no TTL) survived its last run indefinitely there. A cheap
        // guarded no-op for live schedules (the erase filters on `deleting: true`).
        if (status !== 'requires_action') {
          await methods.eraseScheduleIfDrained(scheduleId).catch((err) => {
            logger.warn(`[schedules] erase-on-settle failed for ${scheduleId}:`, err);
          });
        }
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
   * Stamps a scheduled run as abort-REQUESTED with source 'stop', for an abort this
   * service is not the one signalling (the interactive Stop route drives `abortJob`
   * itself). Must run — and SUCCEED — before that abort: the stamp is what tells a
   * concurrent account-deletion quiesce (and the reconciler) that the job state they
   * are about to read is post-abort but pre-persistence, so they defer to the owner's
   * settle instead of confirming a drain mid-write. A failed stamp therefore returns
   * false and the caller must refuse the abort (retryable), not proceed unfenced.
   */
  async function requestScheduledRunAbort(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<'stamped' | 'no_active_run' | 'in_progress' | 'failed'> {
    try {
      const stamped = await methods.requestRunAbort(scheduleId, scheduledFor, 'stop');
      if (stamped === 'in_progress') {
        return 'in_progress';
      }
      return stamped ? 'stamped' : 'no_active_run';
    } catch (err) {
      logger.error('[schedules] failed to record interactive abort request:', err);
      return 'failed';
    }
  }

  /** Stamps a paused run resume-claimed; see markRunResumeClaimed. Best-effort:
   *  a failed stamp only narrows the re-pause hand-off fence, never blocks the resume. */
  async function markScheduledRunResumeClaimed(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<void> {
    await methods.markRunResumeClaimed(scheduleId, scheduledFor).catch((err) => {
      logger.warn('[schedules] failed to stamp resume claim:', err);
    });
  }

  async function markScheduledRunAbortPersisted(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<void> {
    await methods.markRunAbortPersisted(scheduleId, scheduledFor);
  }

  const STOP_PERSISTENCE_WAIT_MS = timings?.stopBarrierTimeoutMs ?? 15_000;
  const STOP_PERSISTENCE_POLL_MS = timings?.stopBarrierPollMs ?? 250;

  async function awaitStopAbortPersistence(
    scheduleId: string,
    scheduledFor: Date,
  ): Promise<boolean> {
    const deadline = Date.now() + STOP_PERSISTENCE_WAIT_MS;
    for (;;) {
      let pending: boolean;
      try {
        const run = await methods.getScheduleRunAbortState(scheduleId, scheduledFor);
        // Only a FRESH interactive-stop abort holds the barrier: deletion-sourced
        // aborts persist nothing after signalling, an absent stamp means no abort
        // actor is writing, and a stale one means the owner-death rules govern.
        pending =
          run != null &&
          run.abortSource === 'stop' &&
          run.abortPersistedAt == null &&
          hasAbortInFlight(run, Date.now());
      } catch (err) {
        // FAIL CLOSED: an unreadable row proves nothing about the route's writes.
        logger.warn('[schedules] abort-persistence barrier read failed:', err);
        pending = true;
      }
      if (!pending) {
        return true;
      }
      if (Date.now() >= deadline) {
        logger.warn(
          `[schedules] stop-abort persistence not confirmed for ${scheduleId} within ` +
            `${STOP_PERSISTENCE_WAIT_MS}ms; leaving the run for the reconciler`,
        );
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, STOP_PERSISTENCE_POLL_MS));
    }
  }

  async function isScheduleLive(
    scheduleId: string,
    expectedConfigRevision?: number,
    options?: { automatic?: boolean; policy?: boolean },
  ): Promise<boolean> {
    if (!scheduleId) {
      return false;
    }
    const schedule = await methods.getScheduleById(scheduleId);
    if (schedule == null) {
      return false;
    }
    // An AUTOMATIC fire must still be wanted. A policy auto-disable (too many failures,
    // insufficient balance) flips `enabled` WITHOUT touching configRevision, so the
    // revision fence below cannot see it — an occurrence already in the claim-to-
    // controller window would otherwise start a billed generation for a schedule that
    // has just been switched off. Run Now is an explicit user action and stays allowed
    // on a disabled schedule, matching fireScheduleNow.
    if (options?.automatic === true && schedule.enabled === false) {
      return false;
    }
    // REVISION FENCE at the admission boundary. Existence alone is not enough: an owner
    // edit landing between the claim and this point means the dispatched prompt/agent
    // came from a config the owner has since replaced, and nothing downstream would
    // catch it because the run persists under the NEW schedule. Refuse before any
    // message is written. Absent on either side disables the fence, so pre-existing
    // schedules and older fires keep working.
    if (
      expectedConfigRevision != null &&
      typeof schedule.configRevision === 'number' &&
      schedule.configRevision !== expectedConfigRevision
    ) {
      return false;
    }
    // LIVE dispatch policy, re-applied exactly as the fire path applies it. A pause
    // can sit unanswered for hours, and an operator's global kill switch, a narrowed
    // `interface.schedules` availability, or a revoked SCHEDULES:USE permission
    // landing in that window touches neither the row nor its revision — none of the
    // checks above can see it, and approving the pause would start a fresh billed
    // continuation the operator believes is stopped. Applies to manual runs too: an
    // emergency stop must stop those approvals as well.
    if (options?.policy === true) {
      if (await engineDeps.isGloballyDisabled()) {
        return false;
      }
      const owner = await engineDeps.getUserContext(schedule.user);
      if (owner == null) {
        return false;
      }
      const limits = await engineDeps.runInTenantContext(owner, () => getLimits(owner));
      if (!limits.enabled) {
        return false;
      }
      if (!(await engineDeps.hasScheduleAccess(owner))) {
        return false;
      }
    }
    return true;
  }

  /** Aborts an active run's loopback job (identity-guarded). Returns whether the
   * abort was delivered (false when the job wasn't reachable — e.g. a peer worker's
   * private store, or a transient error). */
  async function abortActiveRun(
    run: { scheduleId: string; scheduledFor: Date; conversationId?: string },
    preserve: boolean,
    options?: { stampRenewal?: boolean },
  ): Promise<boolean> {
    if (!run.conversationId) {
      return false;
    }
    // Record the abort REQUEST before signalling. This keeps the run holding its global
    // capacity slot until its generation owner writes a terminal outcome (settlement),
    // so an abort that has been asked for but not yet honored cannot free capacity for a
    // new run while the old generation is still alive. The stamp is LOAD-BEARING: it is
    // what makes a concurrent drain (and the reconciler) defer to the owner's settle,
    // so if it cannot be made durable the abort must NOT be signalled — report
    // undelivered and let the caller's unconfirmed/retry path re-drive both.
    //
    // `stampRenewal: false` skips the stamp entirely: callers pass it for CLEANUP
    // aborts of a job they just observed terminal/absent (nothing live will be
    // signalled). Renewing there would re-arm the 30-minute owner-death fence on
    // every retry against a dead owner, so the run could never age into the
    // reconciler's recovery.
    if (options?.stampRenewal !== false) {
      try {
        await methods.requestRunAbort(run.scheduleId, run.scheduledFor, 'deletion');
      } catch (err) {
        logger.warn('[schedules] failed to record abort request; abort withheld:', err);
        return false;
      }
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
   * the claim token to fence any in-flight worker, then DRAINS with the same evidence
   * discipline as account-deletion quiesce — a run whose job is provably absent or
   * settled is recorded and erased here, synchronously; a live generation is aborted
   * and settles through its own outcome write (which erases on settle, so no
   * reconciler is required in any topology). The result is honest: `unconfirmed`
   * means at least one run could not be shown stopped, and the caller must not
   * claim it was.
   */
  async function deleteScheduleForOwner(
    scheduleId: string,
    userId: string,
  ): Promise<ScheduleDeleteResult> {
    const schedule = await methods.markScheduleDeleting(scheduleId, userId);
    if (schedule == null) {
      return 'not_found';
    }
    const active = await methods.getActiveRunsForSchedule(scheduleId);
    // Resolve the checkpointer config once (only when a paused run needs pruning) in
    // the owner's tenant context, matching the interactive abort endpoint's prune.
    const hasPausedRun = active.some(
      (run) => run.status === 'requires_action' && run.conversationId != null,
    );
    // BEST-EFFORT: the prune this feeds is itself best-effort, and a lookup failure
    // must not cost the aborts below.
    const checkpointer = hasPausedRun
      ? await resolveOwnerCheckpointer(schedule.user).catch((err) => {
          logger.warn(`[schedules] checkpointer lookup failed for delete ${scheduleId}:`, err);
          return undefined;
        })
      : undefined;
    let unconfirmed = 0;
    for (const run of active) {
      // UNKNOWN is not ABSENT — the same distinction the quiesce path draws. A lookup
      // that succeeded and returned null is positive evidence no generation holds this
      // conversation; a lookup that THREW is evidence of nothing.
      const live = run.conversationId
        ? await engineDeps.getJobStatus(run.conversationId).then(
            (job) => ({ known: true, job }),
            () => ({ known: false, job: null }),
          )
        : { known: true, job: null };
      const isThisGeneration =
        live.job != null &&
        jobMatchesIdentity(live.job, {
          scheduleId: run.scheduleId,
          scheduledFor: run.scheduledFor,
        });
      // Capture the paused run's checkpoint ids BEFORE any terminal transition below:
      // the prune afterwards is scoped to exactly this set, so checkpoints a
      // replacement turn writes after this point can never be swept up by it.
      const checkpointGeneration =
        run.status === 'requires_action' && run.conversationId
          ? await captureAgentCheckpointGeneration(run.conversationId, checkpointer)
          : undefined;
      // Same abort-in-flight deferral as quiesce: post-abort job state (status `aborted`,
      // or absence once the abort deleted the job) appears before the owner has persisted
      // and settled, so it is not evidence that the generation is done.
      //
      // A paused job whose run row is still `started` is a pause HAND-OFF in flight:
      // the job reports requires_action the instant the run interrupts, while the
      // controller's pause branch is still flushing this segment's writes and records
      // the pause on the row only after them. Settling on the job state alone let the
      // cascade complete before those writes landed, which then recreated the paused
      // response for the deleted schedule. The controller's record (or the paused-
      // window reconciler) flips the row to requires_action, so the deferral is
      // bounded — a later pass settles it.
      const pauseHandoffInFlight =
        isThisGeneration &&
        live.job?.status === 'requires_action' &&
        (run.status === 'started' || hasResumeHandoffInFlight(run, Date.now()));
      const settleable =
        live.known &&
        !hasAbortInFlight(run, Date.now()) &&
        !pauseHandoffInFlight &&
        !(isThisGeneration && live.job?.status === 'running');
      if (settleable) {
        // Positive evidence nothing is generating: settle the row HERE so the erase
        // below can proceed without any reconciler — the clustered entrypoint has
        // none, and deferring these rows to it retained the deleted schedule (and its
        // prompt) indefinitely in that topology. Settle BEFORE aborting: a retained
        // job is the only evidence of a finished run whose outcome write failed.
        const retainedOutcome = isThisGeneration
          ? TERMINAL_JOB_OUTCOMES[live.job!.status]
          : undefined;
        const settledStatus = retainedOutcome ?? 'interrupted';
        const settled = await methods
          .recordRunOutcome({
            scheduleId: run.scheduleId,
            scheduledFor: run.scheduledFor,
            status: settledStatus,
            conversationId: run.conversationId,
            ...(settledStatus === 'interrupted' ? { error: 'Schedule deleted' } : {}),
            autoDisableAfterFailures: DEFAULT_SCHEDULE_LIMITS.autoDisableAfterFailures,
          })
          .then(
            () => true,
            (err) => {
              logger.warn(`[schedules] failed to settle run on delete ${scheduleId}:`, err);
              return false;
            },
          );
        if (settled) {
          // Cleanup abort of a job just observed terminal/absent: nothing live gets
          // signalled, so the stamp is NOT renewed — re-arming the owner-death fence
          // on every delete retry would keep a dead owner's row from ever aging into
          // the reconciler's recovery.
          await abortActiveRun(run, false, { stampRenewal: false });
        } else {
          unconfirmed += 1;
        }
      } else {
        // A live generation (or an unknown one): abort it, preserving the job so its
        // outcome survives, and require the DELIVERY to be confirmed. An abort that
        // was not delivered leaves a generation that keeps producing and billing —
        // reporting this delete as a success would claim otherwise.
        const aborted = await abortActiveRun(run, true);
        if (!aborted) {
          unconfirmed += 1;
        }
      }
      // HITL: prune the durable checkpoints of a run aborted while paused so a new turn
      // in this conversation can't rehydrate the stale interrupt before the Mongo TTL
      // reclaims it (thread_id === conversationId). Idempotent / no-op otherwise.
      //
      // Two guards against a REPLACEMENT owning the conversation: ownership is re-read
      // fresh (the settle/abort awaits above are a window a replacement can claim the
      // conversationId in), and the deletion is SCOPED to the checkpoint ids captured
      // before the terminal transition — so even a replacement that slips in between
      // this read and the delete only ever loses checkpoints that predate the abort,
      // never its own. An unreadable store proves nothing, so it is left alone.
      if (
        run.status === 'requires_action' &&
        run.conversationId &&
        checkpointGeneration != null &&
        checkpointGeneration.checkpointIds.length > 0
      ) {
        const fresh = await engineDeps.getJobStatus(run.conversationId).then(
          (job) => ({ known: true, job }),
          () => ({ known: false, job: null }),
        );
        const freshIsThisGeneration =
          fresh.job != null &&
          jobMatchesIdentity(fresh.job, {
            scheduleId: run.scheduleId,
            scheduledFor: run.scheduledFor,
          });
        const ownsConversation = fresh.known && (fresh.job == null || freshIsThisGeneration);
        if (ownsConversation) {
          await deleteAgentCheckpoint(run.conversationId, checkpointer, checkpointGeneration).catch(
            () => undefined,
          );
        }
      }
    }
    if (unconfirmed > 0) {
      // The run row leaving the active set is the durable acknowledgement that its
      // generation stopped and persisted (the owner settles LAST) — wait for it,
      // bounded, before answering. Without this, every cross-replica delete whose
      // abort delivery cannot be locally proven would answer 503 even though the
      // owner settles moments later.
      const deadline = Date.now() + QUIESCE_DRAIN_TIMEOUT_MS;
      let remaining = unconfirmed;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, QUIESCE_DRAIN_POLL_MS));
        remaining = (await methods.getActiveRunsForSchedule(scheduleId)).length;
        if (remaining === 0) {
          break;
        }
      }
      if (remaining > 0) {
        return 'unconfirmed';
      }
    }
    const erased = await methods.eraseScheduleIfDrained(scheduleId).catch((err) => {
      logger.warn(`[schedules] erase failed for ${scheduleId}:`, err);
      return false;
    });
    return erased ? 'deleted' : 'draining';
  }

  /**
   * Quiesces every schedule of a user ahead of account deletion: marks them all
   * non-claimable (so no new occurrence fires while the cascade runs) and aborts
   * the loopback jobs of any in-flight runs, so a scheduled generation cannot keep
   * persisting messages after the account's messages/conversations are deleted.
   */
  async function quiesceUserSchedules(userId: string): Promise<boolean> {
    await methods.disableUserSchedulesForDeletion(userId);
    const active = await methods.getActiveRunsForUser(userId);
    const unconfirmed: string[] = [];
    for (const run of active) {
      // A RESUMED run's row is still `requires_action`: the resume controller promotes
      // only the job-store record to `running` and the row is not terminalized until the
      // resumed generation finishes. So the row status alone cannot tell a genuinely
      // paused run from one actively generating, and the shortcut below would skip
      // waiting for a live generation that can still persist messages. Read the live job
      // BEFORE aborting, which settles or deletes it and would erase this evidence.
      // UNKNOWN is not ABSENT. A lookup that THREW is evidence of nothing, while one
      // that succeeded and returned null is positive evidence that no generation holds
      // this conversation. Collapsing the two (a bare `.catch(() => null)`) would let a
      // transient store failure read as "genuinely paused" and terminalize a row whose
      // resumed generation is still running — the exact hazard this check exists for.
      const live = run.conversationId
        ? await engineDeps.getJobStatus(run.conversationId).then(
            (job) => ({ known: true, job }),
            () => ({ known: false, job: null }),
          )
        : { known: true, job: null };
      const isThisGeneration =
        live.job != null &&
        jobMatchesIdentity(live.job, {
          scheduleId: run.scheduleId,
          scheduledFor: run.scheduledFor,
        });
      // Settle only on POSITIVE evidence that nothing is generating: an identity-matched
      // job that is not running, an identity MISMATCH (a replacement turn owns the
      // conversation, so this occurrence's generation is already gone), or a confirmed
      // absence. Anything unknown falls through and the drain waits for it.
      //
      // An abort IN FLIGHT is not such evidence, and this is the subtle case: `aborted`
      // and post-abort ABSENCE both appear the instant abortJob wins its CAS, while the
      // owner has yet to persist. Deferring to the owner's settle (see
      // ABORT_SETTLE_GRACE_MS) is what stops a drain from being confirmed mid-write.
      const abortInFlight = hasAbortInFlight(run, Date.now());
      // Same pause hand-off deferral as the schedule delete path: a paused job whose
      // row is still `started` has the controller's pause-branch writes in flight,
      // and settling on the job state alone confirms the drain before they land.
      const pauseHandoffInFlight =
        isThisGeneration &&
        live.job?.status === 'requires_action' &&
        (run.status === 'started' || hasResumeHandoffInFlight(run, Date.now()));
      const settleable =
        live.known &&
        !abortInFlight &&
        !pauseHandoffInFlight &&
        !(isThisGeneration && live.job?.status === 'running');
      // Aborts here never preserve for reconcile: account deletion hard-deletes these
      // run rows, so no reconcile pass would ever finalize or clear a retained job.
      const retainedOutcome = isThisGeneration
        ? TERMINAL_JOB_OUTCOMES[live.job!.status]
        : undefined;
      // `settleable` ALREADY means positive evidence that nothing is generating: an
      // identity-matched job that is not running, an identity MISMATCH (a replacement
      // turn owns the conversation), or a confirmed absence. Any extra condition on top
      // of it strands exactly the cases it was computed to cover — a `started` row whose
      // process died before creating its job reads as a confirmed absence, and the old
      // clause left it active through the whole drain, so account deletion answered 503
      // on every attempt until the 30-minute orphan sweep.
      if (settleable) {
        // SETTLE BEFORE ABORTING. The abort deletes the retained job, and for a run
        // whose inline outcome write exhausted its retries that job is the ONLY evidence
        // it finished — reading its status into a local is not the same as durably
        // recording it. If this write fails, the abort below has not yet run, so the
        // evidence survives for the next pass; the drain simply does not confirm and
        // deletion defers, which is the safe direction.
        // Either the retained job's own outcome, or — for a genuinely PAUSED run whose
        // approval will never be consumed for a deleted account — `interrupted`. Without
        // this a single paused run blocked the account's deletion permanently.
        const settledStatus = retainedOutcome ?? 'interrupted';
        const settledError = QUIESCE_SETTLE_ERRORS[settledStatus];
        const settled = await methods
          .recordRunOutcome({
            scheduleId: run.scheduleId,
            scheduledFor: run.scheduledFor,
            status: settledStatus,
            conversationId: run.conversationId,
            ...(settledError ? { error: settledError } : {}),
            autoDisableAfterFailures: DEFAULT_SCHEDULE_LIMITS.autoDisableAfterFailures,
          })
          .then(() => true)
          .catch((err) => {
            logger.warn('[schedules] failed to settle run on quiesce:', err);
            return false;
          });
        // Only now is the job disposable. On a failed settle, leave it: the row is still
        // active, so the drain reports unconfirmed and a later pass retries with its
        // evidence intact. Cleanup abort of an observed-settled job — no stamp renewal,
        // or every quiesce retry would re-arm the owner-death fence and a dead owner's
        // row could never age into recovery.
        if (settled) {
          await abortActiveRun(run, false, { stampRenewal: false });
        }
        continue;
      }
      // Not settleable here (a live generation, or an unknown job): abort it and let the
      // bounded drain below wait for its own terminal outcome to land.
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
    // Surface anything that did not drain / could not be confirmed so the deletion
    // cascade defers rather than destroying while a generation may still persist.
    // Re-evaluate rather than trusting the initial abort-delivery result: an abort can
    // report false because the job was briefly unreachable, yet that generation then
    // finishes and records a terminal outcome during the drain poll. The run is genuinely
    // settled at that point, so keeping its id in `unconfirmed` would defer account
    // deletion forever. The DRAIN is the authority; delivery is only a hint.
    const confirmed = remaining === 0;
    if (confirmed && unconfirmed.length > 0) {
      logger.info(
        `[schedules] ${unconfirmed.length} abort(s) were not confirmed delivered but their ` +
          'runs settled during the drain; treating the quiesce as complete.',
      );
    }
    if (!confirmed) {
      logger.warn(
        `[schedules] account-deletion quiesce did not confirm ${Math.max(remaining, unconfirmed.length)} ` +
          `in-flight scheduled run(s) settled${unconfirmed.length ? ` [${unconfirmed.join(', ')}]` : ''} ` +
          '— a peer worker generation may still persist data. Guaranteed quiescing requires a ' +
          'shared stream store (USE_REDIS_STREAMS).',
      );
    }
    return confirmed;
  }

  return {
    getLimits,
    engineDeps,
    fireScheduleNow,
    recordScheduleOutcome,
    requestScheduledRunAbort,
    markScheduledRunResumeClaimed,
    markScheduledRunAbortPersisted,
    awaitStopAbortPersistence,
    isScheduleLive,
    deleteScheduleForOwner,
    quiesceUserSchedules,
    initializeScheduleEngine,
  };
}
