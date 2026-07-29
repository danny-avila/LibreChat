import { logger, runAsSystem } from '@librechat/data-schemas';
import type { ScheduleMethods } from '@librechat/data-schemas';
import { registerShutdownTask } from '~/app/shutdown';

const SWEEP_MS = 5 * 60_000;
const SWEEP_JITTER_MS = 30_000;
const SWEEP_BATCH = 100;

export interface ScheduleErasureSweep {
  stop: () => void;
}

export interface ScheduleErasureDeps {
  methods: Pick<ScheduleMethods, 'getDeletingSchedules' | 'eraseScheduleIfDrained'>;
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
          await deps.methods.eraseScheduleIfDrained(schedule.id).catch((err) => {
            logger.warn(`[schedules] erasure sweep failed for ${schedule.id}:`, err);
          });
        }
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
