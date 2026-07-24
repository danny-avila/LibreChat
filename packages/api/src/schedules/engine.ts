import { logger, runAsSystem } from '@librechat/data-schemas';
import type { IScheduleRun } from '@librechat/data-schemas';
import type { ScheduleEngineDeps, JobState } from './types';
import { registerShutdownTask } from '~/app/shutdown';
import { computeNextRunAt } from './cadence';
import { fireSchedule } from './fire';

const TICK_MS = 30_000;
const TICK_JITTER_MS = 2_000;
const LEASE_MS = 5 * 60_000;
const RECONCILE_MIN_RUN_AGE_MS = 2 * 60_000;
const ORPHAN_RUN_AGE_MS = 30 * 60_000;
const ABANDONED_PAUSE_AGE_MS = 25 * 60 * 60_000;
const RECONCILE_BATCH = 100;
// Occurrences due more than this long ago (server downtime / paused engine) are
// skipped forward instead of fired, so a restart doesn't burst stale chats.
const MISFIRE_GRACE_MS = 15 * 60_000;

/**
 * Whether the job currently at a run's conversationId is THIS occurrence's
 * generation. A replacement turn reuses the conversationId but strips the
 * scheduleId/scheduledFor metadata, so an identity mismatch means the original
 * job is gone and its status must not be attributed to (or its hash deleted for)
 * this scheduled run.
 */
function jobIdentityMatches(jobState: JobState | null, run: IScheduleRun): boolean {
  if (jobState == null || jobState.scheduleId !== run.scheduleId || jobState.scheduledFor == null) {
    return false;
  }
  const jobFor = new Date(jobState.scheduledFor).getTime();
  return jobFor === run.scheduledFor.getTime();
}

export type ScheduleEngine = {
  stop: () => void;
  /** Exposed for tests and the run-now handler: one full claim/fire pass. */
  runTick: () => Promise<number>;
};

export function startScheduleEngine(deps: ScheduleEngineDeps): ScheduleEngine {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let ticks = 0;
  const instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  /**
   * Job-store-aware run reconciliation: pauses (`requires_action`) surface on
   * the run doc so overlap-skip ignores them; crashed runs become
   * `interrupted`; runs resumed elsewhere become `success` when the job store
   * still shows completion. Long-running generations are left alone.
   */
  async function reconcile() {
    try {
      const limits = await deps.getLimits();
      // When every replica shares the job store (Redis-backed or single-process), a
      // jobStatus == null genuinely means the job is gone. With private per-worker
      // in-memory stores it can instead mean the run's job lives on a PEER worker, so
      // a non-owning worker must not treat null as orphaned. We still process runs
      // this worker owns (non-null jobStatus = this worker's job) on every replica;
      // only the jobStatus == null orphan/abandoned reaping below is gated on sharing.
      const jobStoreShared = deps.isJobStoreShared();
      const runs = await runAsSystem(() =>
        deps.methods.getRunsForReconciliation(
          new Date(Date.now() - RECONCILE_MIN_RUN_AGE_MS),
          RECONCILE_BATCH,
        ),
      );
      await runAsSystem(async () => {
        for (const run of runs) {
          // Identity-fence the job lookup: a replacement user turn reuses this
          // conversationId but sheds the scheduleId/scheduledFor metadata. Only
          // trust the job's status when it still carries THIS occurrence's identity;
          // otherwise treat the job as gone (null) so a replacement generation's
          // status can never finalize — or its hash be deleted for — this run.
          const jobState = run.conversationId ? await deps.getJobStatus(run.conversationId) : null;
          const jobStatus = jobIdentityMatches(jobState, run) ? jobState!.status : null;
          const ageMs = Date.now() - (run.firedAt?.getTime() ?? 0);
          // Resolve the run owner's limits so crash-reconciled auto-disable uses
          // the same per-principal threshold as an inline completion. Must run in
          // the OWNER's tenant context: getLimits resolves config via the ALS
          // tenant, and this loop is under runAsSystem (system tenant).
          const owner = await deps.getUserContext(run.user);
          const runLimits = owner
            ? await deps.runInTenantContext(owner, () => deps.getLimits(owner))
            : limits;
          // All transitions go through recordRunOutcome so the schedule's lastRun
          // (and the card's status chip) tracks the run, including the pause.
          const finalize = (
            status: 'success' | 'interrupted' | 'error' | 'requires_action',
            error?: string,
          ) =>
            deps.methods.recordRunOutcome({
              scheduleId: run.scheduleId,
              scheduledFor: run.scheduledFor,
              status,
              conversationId: run.conversationId,
              error,
              autoDisableAfterFailures: runLimits.autoDisableAfterFailures,
              // Terminal bookkeeping is fenced on the config the run started under, so a
              // reconciled outcome cannot auto-disable a schedule the owner has edited.
              ...(run.configRevision != null ? { expectConfigRevision: run.configRevision } : {}),
            });
          if (jobStatus === 'running') {
            continue;
          }
          // Surface a pause on the card (lastRun → requires_action).
          if (run.status === 'started' && jobStatus === 'requires_action') {
            await finalize('requires_action');
            continue;
          }
          // A retained terminal job whose inline outcome hook failed transiently —
          // finalize the run from the retained status, then delete the job. The
          // delete is the cleanup path for `preserveForReconcile` jobs (kept
          // without `completedAt`, so the store's finished-job sweep never reaps
          // them); `conversationId` is guaranteed here since jobStatus was fetched.
          if (jobStatus === 'complete') {
            // Finalize either a paused OR a still-started run as success so it
            // stops consuming capacity / blocking overlap.
            await finalize('success');
            await deps.clearReconciledJob(run.conversationId as string, {
              scheduleId: run.scheduleId,
              scheduledFor: run.scheduledFor,
            });
            continue;
          }
          if (jobStatus === 'error') {
            await finalize('error', 'Run ended in error');
            await deps.clearReconciledJob(run.conversationId as string, {
              scheduleId: run.scheduleId,
              scheduledFor: run.scheduledFor,
            });
            continue;
          }
          if (jobStatus === 'aborted') {
            await finalize('interrupted');
            await deps.clearReconciledJob(run.conversationId as string, {
              scheduleId: run.scheduleId,
              scheduledFor: run.scheduledFor,
            });
            continue;
          }
          // A `started` run whose job is gone (jobStatus null) is an orphan. Every
          // run records its conversationId up front (fire.ts pre-generates it), so
          // getJobStatus above already liveness-checked it: a live long-running fire
          // reads as `running` and is left alone; only one whose job is genuinely
          // gone reaches here, so the standard orphan cutoff applies. Gated on
          // jobStoreShared: with private per-worker stores a null could be a peer's
          // live job, so a non-owning worker must not interrupt it (its owner does).
          if (
            jobStoreShared &&
            run.status === 'started' &&
            jobStatus == null &&
            ageMs > ORPHAN_RUN_AGE_MS
          ) {
            await finalize('interrupted');
            continue;
          }
          if (
            jobStoreShared &&
            run.status === 'requires_action' &&
            jobStatus == null &&
            ageMs > ABANDONED_PAUSE_AGE_MS
          ) {
            await finalize('interrupted');
          }
        }
      });

      // Catch terminal runs whose schedule bookkeeping never landed (a crash
      // between the run-row terminalization and the schedule counter update).
      const unbookkept = await runAsSystem(() =>
        deps.methods.getUnbookkeptRuns(
          new Date(Date.now() - RECONCILE_MIN_RUN_AGE_MS),
          RECONCILE_BATCH,
        ),
      );
      await runAsSystem(async () => {
        for (const run of unbookkept) {
          const owner = await deps.getUserContext(run.user);
          const runLimits = owner
            ? await deps.runInTenantContext(owner, () => deps.getLimits(owner))
            : limits;
          await deps.methods.finalizeBookkeeping({
            scheduleId: run.scheduleId,
            scheduledFor: run.scheduledFor,
            status: run.status as 'success' | 'error' | 'interrupted',
            conversationId: run.conversationId,
            error: run.error,
            autoDisableAfterFailures: runLimits.autoDisableAfterFailures,
          });
        }
      });

      // Erase soft-deleted schedules once their active runs have drained. Delete
      // disabled + marked them `deleting` and aborted in-flight jobs; the run
      // reconciliation above finalizes those runs, so here we erase only the
      // schedules with no run still active — their evidence is preserved until
      // settled. eraseScheduleIfDrained is idempotent, so concurrent workers are safe.
      await runAsSystem(async () => {
        const deleting = await deps.methods.getDeletingSchedules(RECONCILE_BATCH);
        for (const schedule of deleting) {
          await deps.methods.eraseScheduleIfDrained(schedule.id).catch(() => undefined);
        }
      });
    } catch (error) {
      logger.error('[schedules] run reconciliation failed:', error);
    }
  }

  /**
   * One claim/fire pass. Claims and cross-tenant reconciliation run in a system
   * tenant context (the claim scans all tenants; strict tenant isolation would
   * otherwise throw on the unscoped query). The fire itself re-enters the
   * owner's context via `runInTenantContext`.
   */
  async function runTick(): Promise<number> {
    // GLOBAL kill switch: stop claiming entirely. This is the operator's hard stop
    // (SCHEDULES_DISABLED, or `interface.schedules: false` in the BASE config), which
    // no principal override can widen — distinct from per-principal availability below.
    // Deliberately gates CLAIMS only; reconcile() is never gated, because in-flight
    // runs must still be settled while the feature is off or they strand `started`
    // rows and leak capacity forever.
    if (await deps.isGloballyDisabled()) {
      return 0;
    }
    // Do NOT gate claims on the per-principal `enabled`: schedules can be enabled per
    // user/role/tenant, so gating here would silently never fire those users'
    // occurrences. The fire path re-resolves the OWNER's limits and skips ('disabled')
    // any occurrence whose owner has the feature off, so an owner-scoped disable is
    // still honored. The base config only supplies the per-tick claim budget.
    const limits = await deps.getLimits();
    let fired = 0;
    // Cap on ACTIVE scheduled runs, not just per-tick starts: the loopback chat
    // endpoint returns as soon as the generation starts and scheduled fires
    // bypass the interactive limiter, so without this the in-flight count would
    // grow by fireConcurrency every tick. Only claim up to the free headroom.
    const active = await runAsSystem(() => deps.methods.countActiveRuns());
    const budget = Math.max(0, limits.fireConcurrency - active);
    for (let i = 0; i < budget; i++) {
      // Claim + the fire's pre-owner-context bookkeeping (disable/advance,
      // cross-tenant reads) run as system; fireSchedule re-enters owner context
      // internally for the run-specific work.
      const done = await runAsSystem(async () => {
        const schedule = await deps.methods.claimDueSchedule({ instanceId, leaseMs: LEASE_MS });
        if (schedule == null) {
          return true;
        }
        const scheduledFor = schedule.nextRunAt ?? new Date();
        // Use DB time, not this worker's clock, for the misfire cutoff: the claim
        // wrote leaseUntil = $$NOW + LEASE_MS, so leaseUntil - LEASE_MS is Mongo's
        // "now" at claim. A skewed worker would otherwise treat a just-claimed
        // occurrence as stale and drop it (advance without firing).
        const dbNow = schedule.leaseUntil ? schedule.leaseUntil.getTime() - LEASE_MS : Date.now();
        // Misfire skip-forward: an occurrence overdue past the grace window (the
        // engine was down/paused) is advanced to the next FUTURE occurrence
        // without firing, so a restart doesn't launch stale or bursty chats.
        if (dbNow - scheduledFor.getTime() > MISFIRE_GRACE_MS) {
          const next = computeNextRunAt({
            cadence: schedule.cadence,
            timezone: schedule.timezone,
            scheduleId: schedule.id,
            // DB claim time, not this worker's clock: a clock-behind worker would
            // otherwise compute another DB-past occurrence and reclaim the same row.
            after: new Date(dbNow),
          });
          if (next == null) {
            await deps.methods
              .disableSchedule(schedule.id, 'invalid_schedule', schedule.claimToken)
              .catch(() => undefined);
          }
          await deps.methods
            .advanceSchedule(schedule.id, next, scheduledFor, schedule.claimToken)
            .catch(() => undefined);
          logger.info(`[schedules] skipped stale occurrence for ${schedule.id} (misfire grace)`);
          return false;
        }
        try {
          const result = await fireSchedule(deps, schedule, limits, scheduledFor, {
            dbNow: new Date(dbNow),
          });
          if (result.fired) {
            fired += 1;
          }
        } catch (error) {
          // A transient preflight throw must not unset nextRunAt (which would
          // leave the schedule enabled but never due again). Reschedule to the
          // next occurrence so it retries; only disable if it is uncomputable.
          logger.error(`[schedules] unexpected fire error for ${schedule.id}:`, error);
          const next = computeNextRunAt({
            cadence: schedule.cadence,
            timezone: schedule.timezone,
            scheduleId: schedule.id,
            // DB claim time (see the misfire branch) so a skewed worker doesn't
            // reschedule to a DB-past occurrence and reclaim the same row.
            after: new Date(dbNow),
          });
          if (next == null) {
            await deps.methods
              .disableSchedule(schedule.id, 'invalid_schedule', schedule.claimToken)
              .catch(() => undefined);
          }
          await deps.methods
            .advanceSchedule(schedule.id, next, scheduledFor, schedule.claimToken)
            .catch(() => undefined);
        }
        return false;
      });
      if (done) {
        break;
      }
    }
    return fired;
  }

  const scheduleNext = () => {
    if (stopped) {
      return;
    }
    timer = setTimeout(tick, TICK_MS + Math.floor(Math.random() * TICK_JITTER_MS));
    timer.unref?.();
  };

  async function tick() {
    if (stopped) {
      return;
    }
    try {
      if (ticks % 4 === 0) {
        await reconcile();
      }
      ticks += 1;
      await runTick();
    } catch (error) {
      logger.error('[schedules] tick failed:', error);
    }
    scheduleNext();
  }

  void reconcile();
  scheduleNext();

  const engine: ScheduleEngine = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    runTick,
  };

  registerShutdownTask('schedule engine', () => {
    engine.stop();
  });

  logger.info('[schedules] engine started');
  return engine;
}
