import { logger, runAsSystem } from '@librechat/data-schemas';
import type { PRAutomationMethods } from '@librechat/data-schemas';
import { isLeader } from '~/cluster';

const REAP_INTERVAL_MS = 60 * 60_000;
let reapTimer: NodeJS.Timeout | undefined;
let reapInFlight: Promise<void> | undefined;

type ReaperMethods = Pick<PRAutomationMethods, 'reapPRAutomations'>;

/** Reads every PR automation record once and removes those whose conversation or owner is gone. */
export async function reapOrphanedPRAutomations({
  reapPRAutomations: reapPage,
}: ReaperMethods): Promise<number> {
  let removed = 0;
  let after: string | undefined;
  do {
    const page = await reapPage({ after });
    removed += page.removed;
    after = page.next;
  } while (after != null);
  return removed;
}

/**
 * Conversations also leave through the retention index, which runs no application code, so the
 * elected replica periodically removes the PR automation records they leave behind. Returns a
 * function that stops the schedule.
 */
export function startPRAutomationReaper(methods: ReaperMethods): () => void {
  if (reapTimer != null) return stopPRAutomationReaper;
  const run = (): void => {
    if (reapInFlight != null) return;
    const current = isLeader()
      .then(async (leader) => {
        if (!leader) return;
        await runAsSystem(() => reapOrphanedPRAutomations(methods));
      })
      .catch((error) => {
        logger.error('[prAutomation] reaping orphaned records failed:', error);
      })
      .finally(() => {
        if (reapInFlight === current) reapInFlight = undefined;
      });
    reapInFlight = current;
  };
  run();
  reapTimer = setInterval(run, REAP_INTERVAL_MS);
  reapTimer.unref();
  return stopPRAutomationReaper;
}

function stopPRAutomationReaper(): void {
  clearInterval(reapTimer);
  reapTimer = undefined;
}

/**
 * Starts the reaper in one worker of a clustered server. Leader election needs Redis; without
 * it every worker counts as the leader, so the worker the primary assigns the file-retention
 * sweep to runs the reaper too. `start` marks the database ready, `assign` marks the worker.
 */
export function createClusteredPRAutomationReaper(
  distributed: boolean,
  methods: ReaperMethods,
): { start: () => void; assign: () => void; stop: () => void } {
  let eligible = distributed;
  let ready = false;
  let stop: (() => void) | undefined;
  const maybeStart = () => {
    if (!eligible || !ready || stop != null) return;
    stop = startPRAutomationReaper(methods);
  };
  return {
    start: () => {
      ready = true;
      maybeStart();
    },
    assign: () => {
      eligible = true;
      maybeStart();
    },
    stop: () => stop?.(),
  };
}
