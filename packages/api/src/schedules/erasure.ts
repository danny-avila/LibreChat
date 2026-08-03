import { logger, runAsSystem } from '@librechat/data-schemas';
import type { ScheduleMethods, IScheduleRun } from '@librechat/data-schemas';
import type { JobState } from './types';
import { hasResumeHandoffInFlight, hasAbortInFlight } from './types';
import { registerShutdownTask } from '~/app/shutdown';

const SWEEP_MS = 5 * 60_000;
const SWEEP_JITTER_MS = 30_000;
const SWEEP_BATCH = 100;
/** Runs with no readable job older than this are presumed owner-dead (matches the
 *  engine reconciler's orphan cutoff). */
const ABANDONED_RUN_AGE_MS = 30 * 60_000;

/** Terminal job status → the run outcome it proves (mirror of the quiesce map). */
const TERMINAL_JOB_OUTCOMES: Record<string, 'success' | 'error' | 'interrupted' | undefined> = {
  complete: 'success',
  error: 'error',
  aborted: 'interrupted',
};

export interface ScheduleErasureSweep {
  stop: () => void;
}

export interface ScheduleErasureDeps {
  methods: Pick<
    ScheduleMethods,
    | 'getDeletingSchedules'
    | 'eraseScheduleIfDrained'
    | 'markEraseAttempted'
    | 'getActiveRunsForSchedule'
    | 'recordRunOutcome'
  >;
  /** Job state at a run's conversationId; null = confirmed absent, throw = unknown. */
  getJobStatus: (conversationId: string) => Promise<JobState | null>;
}

/** Whether the observed job still carries THIS occurrence's scheduled identity. */
function jobMatchesRun(job: JobState | null, run: IScheduleRun): boolean {
  if (job == null || job.scheduleId !== run.scheduleId || job.scheduledFor == null) {
    return false;
  }
  return new Date(job.scheduledFor).getTime() === run.scheduledFor.getTime();
}

/**
 * Settles the abandoned active runs of a DELETING schedule so the erase below can
 * proceed. The clustered entrypoint runs no engine reconciler, and the run TTL now
 * (correctly) never expires active rows — so a deleting schedule whose generation
 * owner died would otherwise retain the run and the owner's prompt indefinitely.
 * Same evidence discipline as the quiesce paths: settle only on positive evidence
 * (a terminal identity-matched job, or a confirmed-absent job past the owner-death
 * cutoff), and defer anything fenced by an in-flight abort or resume hand-off.
 */
async function settleAbandonedRuns(deps: ScheduleErasureDeps, scheduleId: string): Promise<void> {
  const runs = await deps.methods.getActiveRunsForSchedule(scheduleId);
  const now = Date.now();
  for (const run of runs) {
    try {
      if (hasAbortInFlight(run, now) || hasResumeHandoffInFlight(run, now)) {
        continue;
      }
      const job = run.conversationId
        ? await deps.getJobStatus(run.conversationId).then(
            (state) => ({ known: true, state }),
            () => ({ known: false, state: null }),
          )
        : { known: true, state: null };
      if (!job.known) {
        continue;
      }
      const identity = jobMatchesRun(job.state, run);
      if (identity && job.state!.status === 'running') {
        continue;
      }
      if (identity && job.state!.status === 'requires_action') {
        // A paused run of a DELETING schedule: its approval can never be consumed,
        // but a fresh pause hand-off may still be writing — the started-row gate
        // and the resume fence above already deferred those; a settled-state
        // paused row is safe to interrupt.
        if (run.status === 'started') {
          continue;
        }
      }
      const retained = identity ? TERMINAL_JOB_OUTCOMES[job.state!.status] : undefined;
      if (retained == null) {
        // No terminal evidence: only presume the owner dead past the cutoff.
        const age = now - (run.firedAt?.getTime() ?? 0);
        if (age < ABANDONED_RUN_AGE_MS) {
          continue;
        }
      }
      await deps.methods.recordRunOutcome({
        scheduleId: run.scheduleId,
        scheduledFor: run.scheduledFor,
        status: retained ?? 'interrupted',
        conversationId: run.conversationId,
        ...(retained == null ? { error: 'Schedule deleted' } : {}),
        autoDisableAfterFailures: Number.MAX_SAFE_INTEGER,
      });
    } catch (err) {
      logger.warn(`[schedules] abandoned-run settle failed for ${scheduleId}:`, err);
    }
  }
}

/**
 * Erases soft-deleted schedules once they drain — and NOTHING else.
 *
 * A `deleting` row is normally erased by whichever actor first observes it drained: the
 * delete request, or the terminal outcome write (erase-on-settle). Both are single
 * best-effort attempts, so one transient failure — or a lease that outlived the delete —
 * leaves a hidden row holding the user's prompt, with no TTL and no way for the owner to
 * retry it (the row is hidden from their list). In the standard entrypoint the
 * reconciler retries it; the clustered entrypoint runs no engine, so nothing does.
 *
 * This is deliberately NOT the engine: it never claims, leases, fires, advances, or
 * reconciles a run, so running it in every replica of a clustered deployment is safe and
 * changes nothing about v1's single-process scheduling. It only re-drives
 * `eraseScheduleIfDrained`, which re-checks drained-ness itself (no active run, no live
 * lease) and is idempotent — concurrent sweepers race harmlessly.
 */
export function startScheduleErasureSweep(deps: ScheduleErasureDeps): ScheduleErasureSweep {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function sweep(): Promise<void> {
    try {
      await runAsSystem(async () => {
        const deleting = await deps.methods.getDeletingSchedules(SWEEP_BATCH);
        for (const schedule of deleting) {
          await settleAbandonedRuns(deps, schedule.id).catch((err) => {
            logger.warn(`[schedules] abandoned-run pass failed for ${schedule.id}:`, err);
          });
          await deps.methods.eraseScheduleIfDrained(schedule.id).catch((err) => {
            logger.warn(`[schedules] erasure sweep failed for ${schedule.id}:`, err);
          });
        }
        // Rotate the window (never-attempted first) so a batch of undrainable rows
        // cannot re-fill it every sweep and starve the rows behind them.
        await deps.methods
          .markEraseAttempted(deleting.map((schedule) => schedule.id))
          .catch((err) => logger.warn('[schedules] failed to stamp erase attempts:', err));
      });
    } catch (err) {
      logger.error('[schedules] erasure sweep failed:', err);
    }
  }

  function schedule(): void {
    if (stopped) {
      return;
    }
    // Jittered so replicas of a clustered deployment do not sweep in lockstep.
    const delay = SWEEP_MS + Math.floor(Math.random() * SWEEP_JITTER_MS);
    timer = setTimeout(() => {
      void sweep().finally(schedule);
    }, delay);
    timer.unref?.();
  }

  schedule();

  const engineSweep: ScheduleErasureSweep = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };

  registerShutdownTask('schedule erasure sweep', () => engineSweep.stop(), { phase: 'pre-drain' });

  return engineSweep;
}
