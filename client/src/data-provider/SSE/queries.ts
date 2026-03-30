import { useEffect, useMemo, useState } from 'react';
import { apiBaseUrl, QueryKeys, request, dataService } from 'librechat-data-provider';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import type { Agents, TConversation } from 'librechat-data-provider';
import { updateConvoInAllQueries } from '~/utils';

export interface StreamStatusResponse {
  active: boolean;
  streamId?: string;
  status?: 'running' | 'complete' | 'error' | 'aborted';
  aggregatedContent?: Array<{ type: string; text?: string }>;
  createdAt?: number;
  resumeState?: Agents.ResumeState;
}

export const streamStatusQueryKey = (conversationId: string) => ['streamStatus', conversationId];

export const fetchStreamStatus = async (conversationId: string): Promise<StreamStatusResponse> => {
  return request.get<StreamStatusResponse>(
    `${apiBaseUrl()}/api/agents/chat/status/${conversationId}`,
  );
};

export function useStreamStatus(conversationId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: streamStatusQueryKey(conversationId || ''),
    queryFn: () => fetchStreamStatus(conversationId!),
    enabled: !!conversationId && enabled,
    staleTime: 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export const genTitleQueryKey = (conversationId: string) => ['genTitle', conversationId] as const;

/** Response type for active jobs query */
export interface ActiveJobsResponse {
  activeJobIds: string[];
}

/** Module-level queue for title generation (survives re-renders).
 * Stores conversationIds that need title generation once their job completes */
const titleQueue = new Set<string>();
const processedTitles = new Set<string>();

/** Listeners to notify when queue changes (for non-resumable streams like assistants) */
const queueListeners = new Set<() => void>();

/** Queue a conversation for title generation (call when starting new conversation) */
export function queueTitleGeneration(conversationId: string) {
  if (!processedTitles.has(conversationId)) {
    titleQueue.add(conversationId);
    queueListeners.forEach((listener) => listener());
  }
}

/**
 * Hook to process the title generation queue.
 * Only fetches titles AFTER the job completes (not in activeJobIds).
 * Place this high in the component tree (e.g., Nav.tsx).
 */
export function useTitleGeneration(enabled = true) {
  const queryClient = useQueryClient();
  const [queueVersion, setQueueVersion] = useState(0);
  const [readyToFetch, setReadyToFetch] = useState<string[]>([]);

  const { data: activeJobsData } = useActiveJobs(enabled);
  const activeJobIds = useMemo(
    () => activeJobsData?.activeJobIds ?? [],
    [activeJobsData?.activeJobIds],
  );

  useEffect(() => {
    const listener = () => setQueueVersion((v) => v + 1);
    queueListeners.add(listener);
    return () => {
      queueListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const activeSet = new Set(activeJobIds);
    const completedJobs: string[] = [];

    for (const conversationId of titleQueue) {
      if (!activeSet.has(conversationId) && !processedTitles.has(conversationId)) {
        completedJobs.push(conversationId);
      }
    }

    if (completedJobs.length > 0) {
      setReadyToFetch((prev) => [...new Set([...prev, ...completedJobs])]);
    }
  }, [activeJobIds, queueVersion]);

  // Fetch titles for ready conversations
  const titleQueries = useQueries({
    queries: readyToFetch.map((conversationId) => ({
      queryKey: genTitleQueryKey(conversationId),
      queryFn: () => dataService.genTitle({ conversationId }),
      staleTime: Infinity,
      retry: false,
    })),
  });

  useEffect(() => {
    titleQueries.forEach((titleQuery, index) => {
      const conversationId = readyToFetch[index];
      if (!conversationId || processedTitles.has(conversationId)) return;

      if (titleQuery.isSuccess && titleQuery.data) {
        const { title } = titleQuery.data;
        queryClient.setQueryData(
          [QueryKeys.conversation, conversationId],
          (convo: TConversation | undefined) => (convo ? { ...convo, title } : convo),
        );
        updateConvoInAllQueries(queryClient, conversationId, (c) => ({ ...c, title }));
        // Only update document title if this conversation is currently active
        if (window.location.pathname.includes(conversationId)) {
          document.title = title;
        }
        processedTitles.add(conversationId);
        titleQueue.delete(conversationId);
        setReadyToFetch((prev) => prev.filter((id) => id !== conversationId));
      } else if (titleQuery.isError) {
        // Mark as processed even on error to avoid infinite retries
        processedTitles.add(conversationId);
        titleQueue.delete(conversationId);
        setReadyToFetch((prev) => prev.filter((id) => id !== conversationId));
      }
    });
  }, [titleQueries, readyToFetch, queryClient]);
}

/**
 * React Query hook for active job IDs.
 * - Polls while jobs are active
 * - Shows generation indicators in conversation list
 */
export function useActiveJobs(enabled = true) {
  return useQuery({
    queryKey: [QueryKeys.activeJobs],
    queryFn: () => dataService.getActiveJobs(),
    enabled,
    staleTime: 5_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: (data) => ((data?.activeJobIds?.length ?? 0) > 0 ? 5_000 : false),
    retry: false,
  });
}
