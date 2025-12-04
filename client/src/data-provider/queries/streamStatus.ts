import { useQuery } from '@tanstack/react-query';
import { request } from 'librechat-data-provider';

export interface StreamStatusResponse {
  active: boolean;
  streamId?: string;
  status?: 'running' | 'complete' | 'error' | 'aborted';
  chunkCount?: number;
  aggregatedContent?: Array<{ type: string; text?: string }>;
  createdAt?: number;
}

/**
 * Query key for stream status
 */
export const streamStatusQueryKey = (conversationId: string) => ['streamStatus', conversationId];

/**
 * Fetch stream status for a conversation
 */
export const fetchStreamStatus = async (conversationId: string): Promise<StreamStatusResponse> => {
  const response = await request.get(`/api/agents/chat/status/${conversationId}`);
  return response.data;
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
