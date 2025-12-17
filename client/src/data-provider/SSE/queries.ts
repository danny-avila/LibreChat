import { useQuery } from '@tanstack/react-query';
import { QueryKeys, request, dataService } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';

export interface StreamStatusResponse {
  active: boolean;
  streamId?: string;
  status?: 'running' | 'complete' | 'error' | 'aborted';
  aggregatedContent?: Array<{ type: string; text?: string }>;
  createdAt?: number;
  resumeState?: Agents.ResumeState;
}

/**
 * Query key for stream status
 */
export const streamStatusQueryKey = (conversationId: string) => ['streamStatus', conversationId];

/**
 * Fetch stream status for a conversation
 */
export const fetchStreamStatus = async (conversationId: string): Promise<StreamStatusResponse> => {
  console.log('[fetchStreamStatus] Fetching status for:', conversationId);
  const result = await request.get<StreamStatusResponse>(
    `/api/agents/chat/status/${conversationId}`,
  );
  console.log('[fetchStreamStatus] Result:', result);
  return result;
};

/**
 * React Query hook for checking if a conversation has an active generation stream.
 * Only fetches when conversationId is provided and resumable streams are enabled.
 */
export function useStreamStatus(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: streamStatusQueryKey(conversationId || ''),
    queryFn: () => fetchStreamStatus(conversationId!),
    enabled: !!conversationId && enabled,
    staleTime: 1000, // Consider stale after 1 second
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/**
 * Query key for active jobs
 */
export const activeJobsQueryKey = [QueryKeys.activeJobs] as const;

/**
 * React Query hook for getting all active job IDs for the current user.
 * Used to show generation indicators in the conversation list.
 *
 * Key behaviors:
 * - Fetches on mount to get initial state (handles page refresh)
 * - Refetches on window focus (handles multi-tab scenarios)
 * - Optimistic updates from useResumableSSE when jobs start/complete
 * - Polls every 5s while there are active jobs (catches completions when navigated away)
 */
export function useActiveJobs(enabled = true) {
  return useQuery({
    queryKey: activeJobsQueryKey,
    queryFn: () => dataService.getActiveJobs(),
    enabled,
    staleTime: 5_000, // 5s - short to catch completions quickly
    refetchOnMount: true,
    refetchOnWindowFocus: true, // Catch up on tab switch (multi-tab scenario)
    // Poll every 5s while there are active jobs to catch completions when navigated away
    refetchInterval: (data) => {
      const hasActiveJobs = (data?.activeJobIds?.length ?? 0) > 0;
      return hasActiveJobs ? 5_000 : false;
    },
    retry: false,
  });
}
