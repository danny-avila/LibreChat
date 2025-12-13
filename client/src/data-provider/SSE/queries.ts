import { useQuery } from '@tanstack/react-query';
import { request } from 'librechat-data-provider';
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
