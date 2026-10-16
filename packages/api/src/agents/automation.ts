import { logger, runAsSystem } from '@librechat/data-schemas';
import type { PRAutomationMethods } from '@librechat/data-schemas';
import { isLeader } from '~/cluster';

const REAP_INTERVAL_MS = 60 * 60_000;
let reapTimer: NodeJS.Timeout | undefined;
let reapInFlight: Promise<void> | undefined;

/** Reads every PR automation record once and removes those whose conversation or owner is gone. */
export async function reapOrphanedPRAutomations({
  reapPRAutomations: reapPage,
}: Pick<PRAutomationMethods, 'reapPRAutomations'>): Promise<number> {
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
 * elected replica periodically removes the PR automation records they leave behind.
 */
export function startPRAutomationReaper(
  methods: Pick<PRAutomationMethods, 'reapPRAutomations'>,
): void {
  if (reapTimer != null) return;
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
}
