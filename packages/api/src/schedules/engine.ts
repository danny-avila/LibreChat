import { logger, runAsSystem } from '@librechat/data-schemas';
import type { ScheduleEngineDeps } from './types';
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
      const runs = await runAsSystem(() =>
        deps.methods.getRunsForReconciliation(
          new Date(Date.now() - RECONCILE_MIN_RUN_AGE_MS),
          RECONCILE_BATCH,
        ),
      );
      await runAsSystem(async () => {
        for (const run of runs) {
          const jobStatus = run.conversationId ? await deps.getJobStatus(run.conversationId) : null;
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
            await deps.clearReconciledJob(run.conversationId as string);
            continue;
          }
          if (jobStatus === 'error') {
            await finalize('error', 'Run ended in error');
            await deps.clearReconciledJob(run.conversationId as string);
            continue;
          }
          if (jobStatus === 'aborted') {
            await finalize('interrupted');
            await deps.clearReconciledJob(run.conversationId as string);
            continue;
          }
          // A `started` run whose job is gone (jobStatus null) is an orphan — but
          // only interrupt at the 30-min cutoff when it recorded a conversationId,
          // i.e. we could actually liveness-check it. Without one, getJobStatus
          // can't be queried, so a legit long-running fire whose ambiguous POST
          // lost the conversationId would be wrongly finalized before its
          // completion hook (which matches by scheduleId, not conversationId) can
          // record success. Reap those only after the far longer abandonment
          // window as a truly-stuck backstop.
          if (run.status === 'started' && jobStatus == null) {
            const cutoff = run.conversationId ? ORPHAN_RUN_AGE_MS : ABANDONED_PAUSE_AGE_MS;
            if (ageMs > cutoff) {
              await finalize('interrupted');
            }
            continue;
          }
          if (
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
    const limits = await deps.getLimits();
    if (!limits.enabled) {
      return 0;
    }
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
        // Misfire skip-forward: an occurrence overdue past the grace window (the
        // engine was down/paused) is advanced to the next FUTURE occurrence
        // without firing, so a restart doesn't launch stale or bursty chats.
        if (Date.now() - scheduledFor.getTime() > MISFIRE_GRACE_MS) {
          const next = computeNextRunAt({
            cadence: schedule.cadence,
            timezone: schedule.timezone,
            scheduleId: schedule.id,
          });
          if (next == null) {
            await deps.methods
              .disableSchedule(schedule.id, 'invalid_schedule')
              .catch(() => undefined);
          }
          await deps.methods.advanceSchedule(schedule.id, next).catch(() => undefined);
          logger.info(`[schedules] skipped stale occurrence for ${schedule.id} (misfire grace)`);
          return false;
        }
        try {
          const result = await fireSchedule(deps, schedule, limits, scheduledFor);
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
          });
          if (next == null) {
            await deps.methods
              .disableSchedule(schedule.id, 'invalid_schedule')
              .catch(() => undefined);
          }
          await deps.methods.advanceSchedule(schedule.id, next).catch(() => undefined);
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
