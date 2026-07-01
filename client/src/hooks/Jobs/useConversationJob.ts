import { useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import type { TAgentJob, TAgentJobsResponse } from 'librechat-data-provider';
import { useJobQuery, useJobsQuery } from '~/data-provider/Jobs/queries';
import { ACTIVE_JOB_STATUSES, ACTIVE_JOBS_STATUS_FILTER } from './status';
import useJobEvents from './useJobEvents';

function pickJobForConversation(jobs: TAgentJob[] | undefined): TAgentJob | undefined {
  if (!jobs?.length) {
    return undefined;
  }
  const active = jobs.find((entry) => ACTIVE_JOB_STATUSES.has(entry.status));
  return active ?? jobs[0];
}

/**
 * Resolves the job tied to a conversation (if any), keeps it fresh via SSE,
 * and falls back to polling while the job is still active.
 */
export default function useConversationJob(
  conversationId?: string,
  bootstrapJobId?: string,
): TAgentJob | undefined {
  const enabled = !!conversationId && conversationId !== Constants.NEW_CONVO;

  const { data: listData } = useJobsQuery(
    { conversationId: conversationId ?? '' },
    {
      enabled,
      refetchInterval: (data: TAgentJobsResponse | undefined) => {
        const jobs = data?.jobs ?? [];
        const active = jobs.some((entry) => ACTIVE_JOB_STATUSES.has(entry.status));
        return active ? 5000 : false;
      },
    },
  );

  const listJob = useMemo(() => pickJobForConversation(listData?.jobs), [listData?.jobs]);

  const jobId = listJob?._id ?? bootstrapJobId ?? '';

  /** Prefer the single-job cache — updated immediately by SSE via useJobEvents. */
  const { data: singleData } = useJobQuery(jobId, {
    enabled: enabled && !!jobId,
  });

  const job = singleData?.job ?? listJob;

  useJobEvents(job?._id, conversationId);

  return job;
}

/** Active background jobs for the sidebar and cross-task indicators. */
export function useActiveAgentJobs(enabled = true) {
  return useJobsQuery(
    { status: ACTIVE_JOBS_STATUS_FILTER },
    {
      enabled,
      refetchInterval: (listData: TAgentJobsResponse | undefined) =>
        (listData?.jobs?.length ?? 0) > 0 ? 5000 : false,
    },
  );
}

/** Count of active background jobs for the current user. */
export function useActiveJobsCount(enabled = true): number {
  const { data } = useActiveAgentJobs(enabled);
  return data?.jobs?.length ?? 0;
}
