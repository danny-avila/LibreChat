export const MEILI_INDEX_SYNC_INTERVAL_MS = 60_000;

type IndexSyncReason = 'startup' | 'periodic';

interface IndexSyncSchedulerOptions {
  run: (reason: IndexSyncReason) => Promise<unknown>;
  onError: (error: unknown) => void;
  intervalMs?: number;
}

interface IndexSyncScheduler {
  stop(): void;
}

/**
 * Runs index reconciliation at startup and periodically without allowing local overlap.
 * Cross-replica coordination remains the responsibility of the distributed index-sync job.
 */
export function startIndexSyncScheduler({
  run,
  onError,
  intervalMs = MEILI_INDEX_SYNC_INTERVAL_MS,
}: IndexSyncSchedulerOptions): IndexSyncScheduler {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError('Meilisearch index sync interval must be a positive finite number');
  }

  let inFlight: Promise<void> | undefined;
  const invoke = (reason: IndexSyncReason): void => {
    if (inFlight != null) {
      return;
    }
    const current = Promise.resolve()
      .then(() => run(reason))
      .catch(onError)
      .then(() => undefined)
      .finally(() => {
        if (inFlight === current) {
          inFlight = undefined;
        }
      });
    inFlight = current;
  };

  invoke('startup');
  const timer = setInterval(() => invoke('periodic'), intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
  };
}
