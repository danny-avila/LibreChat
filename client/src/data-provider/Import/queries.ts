import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
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

export const useImportJobQuery = (
  jobId: string | null,
): QueryObserverResult<TImportJob, unknown> => {
  const queryClient = useQueryClient();

  return useQuery<TImportJob, unknown, TImportJob>(
    [QueryKeys.importJob, jobId],
    () => dataService.getImportJob(jobId ?? ''),
    {
      enabled: jobId != null,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: importJobRefetchInterval,
      onSuccess: (data) => {
        if (data.phase === 'completed') {
          queryClient.invalidateQueries([QueryKeys.allConversations]);
        }
      },
    },
  );
};
