import { QueryKeys } from 'librechat-data-provider';
import type { QueryClient } from '@tanstack/react-query';
import type { TAgentJob, TAgentJobsResponse } from 'librechat-data-provider';
import { ACTIVE_JOB_STATUSES, ACTIVE_JOBS_STATUS_FILTER } from './status';

/** React Query cache key for a conversation-scoped job list. */
export function jobsListKey(conversationId: string): [string, string, string] {
  return [QueryKeys.jobs, 'all', conversationId];
}

/** React Query cache key for the sidebar active-jobs list. */
export function activeJobsListKey(): [string, string, string] {
  return [QueryKeys.jobs, ACTIVE_JOBS_STATUS_FILTER, 'all'];
}

function upsertJob(jobs: TAgentJob[], job: TAgentJob): TAgentJob[] {
  const index = jobs.findIndex((entry) => entry._id === job._id);
  if (index === -1) {
    return [job, ...jobs];
  }
  const next = [...jobs];
  next[index] = job;
  return next;
}

/** Writes a job into list caches so the banner and sidebar update immediately. */
export function patchJobInListCache(queryClient: QueryClient, job: TAgentJob): void {
  queryClient.setQueryData<TAgentJobsResponse>(jobsListKey(job.conversationId), (old) => ({
    jobs: upsertJob(old?.jobs ?? [], job),
  }));

  queryClient.setQueryData<TAgentJobsResponse>(activeJobsListKey(), (old) => {
    const existing = old?.jobs ?? [];
    if (!ACTIVE_JOB_STATUSES.has(job.status)) {
      const jobs = existing.filter((entry) => entry._id !== job._id);
      return { jobs };
    }
    return { jobs: upsertJob(existing, job) };
  });
}
