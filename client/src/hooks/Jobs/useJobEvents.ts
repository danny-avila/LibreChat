import { useEffect } from 'react';
import { SSE } from 'sse.js';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, apiBaseUrl } from 'librechat-data-provider';
import type { TAgentJob, TAgentJobResponse } from 'librechat-data-provider';
import { useAuthContext } from '~/hooks/AuthContext';
import { patchJobInListCache } from './cache';

const TERMINAL_STATUSES = new Set(['done', 'error', 'canceled']);

/**
 * Subscribes to a job's live progress stream. On connect the server replays a
 * `snapshot` (so reopening a tab shows everything that happened while it was
 * closed), then pushes `update` events as the worker advances the job. Every
 * event writes the fresh job into the React Query cache and refreshes the
 * conversation messages so new step checkpoints appear in the thread.
 *
 * @param jobId - Job to follow, or a falsy value to disable the subscription.
 * @param conversationId - Conversation whose messages should refresh on each step.
 */
export default function useJobEvents(jobId?: string, conversationId?: string): void {
  const { token, isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!jobId || !isAuthenticated || !token) {
      return;
    }

    const url = `${apiBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}/events`;
    const sse = new SSE(url, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET',
    });

    const applyJob = (job?: TAgentJob) => {
      if (!job) {
        return;
      }
      queryClient.setQueryData<TAgentJobResponse>([QueryKeys.job, jobId], { job });
      patchJobInListCache(queryClient, job);
      queryClient.invalidateQueries([QueryKeys.jobs]);
      if (conversationId) {
        queryClient.invalidateQueries([QueryKeys.messages, conversationId]);
      }
      if (TERMINAL_STATUSES.has(job.status)) {
        sse.close();
      }
    };

    const handle = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        applyJob(payload.job);
      } catch {
        /* ignore malformed frames */
      }
    };

    sse.addEventListener('snapshot', handle as EventListener);
    sse.addEventListener('update', handle as EventListener);

    return () => {
      sse.removeEventListener('snapshot', handle as EventListener);
      sse.removeEventListener('update', handle as EventListener);
      sse.close();
    };
  }, [jobId, conversationId, token, isAuthenticated, queryClient]);
}
