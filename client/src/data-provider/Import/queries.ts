import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryClient, QueryObserverResult } from '@tanstack/react-query';
import type { TImportJob } from 'librechat-data-provider';

const POLL_MS = 2000;

const TERMINAL_PHASES = new Set<TImportJob['phase']>([
  'awaiting_confirmation',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * Determines the polling cadence for an import job.
 *
 * Polls every `POLL_MS` while the job is queued, being inspected, or
 * actively importing conversations/assets, and while no data has arrived
 * yet. Stops on every terminal phase, including `awaiting_confirmation`:
 * the job is idle there, waiting on the user to confirm before it starts,
 * so continuing to poll would burn requests for nothing.
 */
export const importJobRefetchInterval = (data: TImportJob | undefined): number | false => {
  if (!data) {
    return POLL_MS;
  }
  return TERMINAL_PHASES.has(data.phase) ? false : POLL_MS;
};

/**
 * Fetches a single import job and, the moment a fetch reveals the job just
 * finished, invalidates the conversation list so the sidebar reflects what
 * the background job wrote to the database.
 *
 * This lives in the fetcher itself rather than in `useQuery`'s `onSuccess`
 * config on purpose: `onSuccess` is a per-observer callback tied to React
 * Query's cache-update lifecycle (deprecated in v5 for exactly this reason),
 * so it can re-run on every component that observes the query, not once per
 * real network response. Placing the invalidation here ties it to the one
 * concrete event that matters, an actual server response confirming
 * completion, and keeps `useImportJobQuery` itself free of side effects: it
 * only wires up the cache key and the polling cadence.
 */
export const fetchImportJob = async (
  jobId: string,
  queryClient: QueryClient,
): Promise<TImportJob> => {
  const data = await dataService.getImportJob(jobId);
  if (data.phase === 'completed') {
    queryClient.invalidateQueries([QueryKeys.allConversations]);
  }
  return data;
};

export const useImportJobQuery = (
  jobId: string | null,
): QueryObserverResult<TImportJob, unknown> => {
  const queryClient = useQueryClient();

  return useQuery<TImportJob, unknown, TImportJob>(
    [QueryKeys.importJob, jobId],
    () => fetchImportJob(jobId ?? '', queryClient),
    {
      enabled: jobId != null,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      /**
       * Once mounted, `refetchInterval` alone keeps an active job fresh;
       * a stale-but-cached job needs no forced refetch on remount. This
       * also avoids re-running the completion side effect in
       * `fetchImportJob` every time the panel is closed and reopened
       * after the job has already finished.
       */
      refetchOnMount: false,
      refetchInterval: importJobRefetchInterval,
    },
  );
};
