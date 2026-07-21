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
          // Terminal reconciliation goes through recordRunOutcome so a resumed
          // run records the same lastRun/counter bookkeeping as an inline finish.
          const finalize = (status: 'success' | 'interrupted') =>
            deps.methods.recordRunOutcome({
              scheduleId: run.scheduleId,
              scheduledFor: run.scheduledFor,
              status,
              conversationId: run.conversationId,
              autoDisableAfterFailures: limits.autoDisableAfterFailures,
            });
          if (jobStatus === 'running') {
            continue;
          }
          if (run.status === 'started' && jobStatus === 'requires_action') {
            await deps.methods.transitionRunStatus(
              run.scheduleId,
              run.scheduledFor,
              'started',
              'requires_action',
            );
            continue;
          }
          if (run.status === 'requires_action' && jobStatus === 'complete') {
            await finalize('success');
            continue;
          }
          if (run.status === 'started' && jobStatus == null && ageMs > ORPHAN_RUN_AGE_MS) {
            await finalize('interrupted');
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
    // Cap per-tick starts at the configured concurrency: the loopback chat
    // endpoint returns as soon as a resumable generation starts, so an
    // unbounded loop would launch far more concurrent runs than intended.
    for (let i = 0; i < limits.fireConcurrency; i++) {
      // Claim + the fire's pre-owner-context bookkeeping (disable/advance,
      // cross-tenant reads) run as system; fireSchedule re-enters owner context
      // internally for the run-specific work.
      const done = await runAsSystem(async () => {
        const schedule = await deps.methods.claimDueSchedule({ instanceId, leaseMs: LEASE_MS });
        if (schedule == null) {
          return true;
        }
        const scheduledFor = schedule.nextRunAt ?? new Date();
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
