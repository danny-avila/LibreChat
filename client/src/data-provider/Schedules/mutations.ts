/* Scheduled chats */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, EModelEndpoint, dataService } from 'librechat-data-provider';
import type {
  TSchedule,
  TCreateSchedule,
  TUpdateSchedule,
  TSchedulesResponse,
  TScheduleRunNowResponse,
} from 'librechat-data-provider';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { extendActiveJobsGrace } from '~/data-provider/SSE/queries';
import { upsertConvoInAllQueries } from '~/utils';

export const useCreateScheduleMutation = (
  options?: UseMutationOptions<TSchedule, Error, TCreateSchedule>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSchedule, Error, TCreateSchedule>(
    [MutationKeys.createSchedule],
    (payload: TCreateSchedule) => dataService.createSchedule(payload),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSuccess?.(...args);
      },
    },
  );
};

export type UpdateScheduleParams = { id: string; payload: TUpdateSchedule };
export const useUpdateScheduleMutation = (
  options?: UseMutationOptions<TSchedule, Error, UpdateScheduleParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TSchedule, Error, UpdateScheduleParams>(
    [MutationKeys.updateSchedule],
    ({ id, payload }: UpdateScheduleParams) => dataService.updateSchedule(id, payload),
    {
      ...options,
      onSuccess: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSuccess?.(...args);
      },
    },
  );
};

export const useDeleteScheduleMutation = (
  options?: UseMutationOptions<{ id: string }, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, string>(
    [MutationKeys.deleteSchedule],
    (id: string) => dataService.deleteSchedule(id),
    {
      ...options,
      // An `unconfirmed` 503 is still a server-side mutation: the schedule has
      // already been disabled, marked deleting, and hidden from list reads.
      // Refresh on either outcome so the card cannot remain actionable in cache.
      onSettled: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSettled?.(...args);
      },
    },
  );
};

/**
 * Puts the started run's chat in the sidebar straight away.
 *
 * The conversation does not exist yet when this response lands: run-now answers
 * once the trigger delivery is durable, and the generation that writes the
 * conversation starts after it. Refetching the lists here would come back
 * without the chat and leave the sidebar exactly as it was — the bug this
 * closes — so the row is seeded from what the response and the cached schedule
 * already name, the same way a locally started chat is seeded before its first
 * message persists. The next natural list refetch replaces it with the server's
 * own row, generated title included.
 */
function seedStartedRunConversation(
  queryClient: QueryClient,
  { scheduleId, conversationId }: TScheduleRunNowResponse,
): void {
  if (!conversationId) {
    return;
  }
  const cached = queryClient.getQueryData<TSchedulesResponse>([QueryKeys.schedules]);
  const schedule = cached?.schedules.find((entry) => entry.id === scheduleId);
  if (schedule == null) {
    return;
  }
  const now = new Date().toISOString();
  upsertConvoInAllQueries(queryClient, {
    conversationId,
    /** Mirrors the fire path's own resolution — an operator pin outranks the
     *  schedule's stored destination — so the row is seeded into the project
     *  list the run is actually filed under, and into no other. */
    chatProjectId: cached?.limits.projectId ?? schedule.chatProjectId ?? null,
    endpoint: EModelEndpoint.agents,
    agent_id: schedule.agent_id,
    title: schedule.name,
    createdAt: now,
    updatedAt: now,
  });
  /** Nothing here will open a stream for this run, so the active-job list is the
   *  only thing that can show the row as running — and it stops polling while
   *  nothing is listed. Report the generation this click just started and re-arm
   *  the query, which picks the interval back up once it has fetched. */
  extendActiveJobsGrace();
  queryClient.invalidateQueries([QueryKeys.activeJobs]);
}

export const useRunScheduleNowMutation = (
  options?: UseMutationOptions<TScheduleRunNowResponse, Error, string>,
) => {
  const queryClient = useQueryClient();
  return useMutation<TScheduleRunNowResponse, Error, string>(
    [MutationKeys.runSchedule],
    (id: string) => dataService.runScheduleNow(id),
    {
      ...options,
      onSuccess: (data, ...rest) => {
        seedStartedRunConversation(queryClient, data);
        options?.onSuccess?.(data, ...rest);
      },
      // Invalidate on SETTLED, not just success: several run-now 409 paths are still
      // server-side mutations (a balance skip updates lastRun/counters and can
      // auto-disable; agent/permission/invalid-schedule skips disable the schedule
      // before returning), so the card must refresh on those errors too rather than
      // wait for the polling interval.
      onSettled: (...args) => {
        queryClient.invalidateQueries([QueryKeys.schedules]);
        options?.onSettled?.(...args);
      },
    },
  );
};
