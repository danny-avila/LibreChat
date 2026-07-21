import { logger } from '@librechat/data-schemas';
import type { ScheduleEngineDeps } from './types';
import { registerShutdownTask } from '~/app/shutdown';
import { fireSchedule } from './fire';

const TICK_MS = 30_000;
const TICK_JITTER_MS = 2_000;
const LEASE_MS = 5 * 60_000;
const MAX_CLAIMS_PER_TICK = 20;
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
      const runs = await deps.methods.getRunsForReconciliation(
        new Date(Date.now() - RECONCILE_MIN_RUN_AGE_MS),
        RECONCILE_BATCH,
      );
      for (const run of runs) {
        const jobStatus = run.conversationId ? await deps.getJobStatus(run.conversationId) : null;
        const ageMs = Date.now() - (run.firedAt?.getTime() ?? 0);
        const transition = (to: 'requires_action' | 'interrupted' | 'success') =>
          deps.methods.transitionRunStatus(run.scheduleId, run.scheduledFor, run.status, to);
        if (jobStatus === 'running') {
          continue;
        }
        if (run.status === 'started' && jobStatus === 'requires_action') {
          await transition('requires_action');
          continue;
        }
        if (run.status === 'requires_action' && jobStatus === 'complete') {
          await transition('success');
          continue;
        }
        if (run.status === 'started' && jobStatus == null && ageMs > ORPHAN_RUN_AGE_MS) {
          await transition('interrupted');
          continue;
        }
        if (
          run.status === 'requires_action' &&
          jobStatus == null &&
          ageMs > ABANDONED_PAUSE_AGE_MS
        ) {
          await transition('interrupted');
        }
      }
    } catch (error) {
      logger.error('[schedules] run reconciliation failed:', error);
    }
  }

  async function runTick(): Promise<number> {
    const limits = await deps.getLimits();
    let fired = 0;
    for (let i = 0; i < Math.min(MAX_CLAIMS_PER_TICK, limits.fireConcurrency * 4); i++) {
      const schedule = await deps.methods.claimDueSchedule({ instanceId, leaseMs: LEASE_MS });
      if (schedule == null) {
        break;
      }
      const scheduledFor = schedule.nextRunAt ?? new Date();
      try {
        const result = await fireSchedule(deps, schedule, limits, scheduledFor);
        if (result.fired) {
          fired += 1;
        }
      } catch (error) {
        logger.error(`[schedules] unexpected fire error for ${schedule.id}:`, error);
        await deps.methods.advanceSchedule(schedule.id, null).catch(() => undefined);
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
