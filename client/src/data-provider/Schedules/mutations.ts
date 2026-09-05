/* Scheduled chats */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  TSchedule,
  TConversation,
  TCreateSchedule,
  TUpdateSchedule,
  TScheduleRunNowResponse,
} from 'librechat-data-provider';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { extendActiveJobsGrace } from '~/data-provider/SSE/queries';
import { upsertConvoInAllQueries, isNotFoundError } from '~/utils';

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
 * Waits before each probe, so the first one is not spent on a conversation that
 * cannot exist yet. Admission is normally a second or two, but a failed dispatch
 * is retried with exponential backoff, so the wait has a long tail: eight probes
 * over roughly forty seconds cover the ordinary case without turning one click
 * into an open-ended poll. A run admitted after that is left to the next list
 * refetch rather than watched forever.
 */
const ADMISSION_DELAYS_MS = [750, 1_500, 3_000, 6_000, 8_000, 8_000, 8_000, 8_000];

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Puts a manual run's chat in the sidebar once the server actually has it.
 *
 * Run-now answers as soon as the trigger delivery is durable, and the generation
 * that writes the conversation starts after that — so at the moment the response
 * lands there is nothing to refetch, which is why the click appeared to do
 * nothing at all. The conversation route answers 404 until that write commits and
 * applies the same visibility rule the list query does, which makes it an exact
 * admission probe: a 200 means the chat is listable now, and carries the server's
 * own row rather than a guess assembled from the client's cached schedule.
 *
 * A 404 is the run not having started yet; any other failure is not, and ends the
 * watch rather than spending the budget on a request that is not going to change
 * its answer.
 *
 * Deliberately detached from the caller: the sidebar has to gain the chat whether
 * or not the panel the run was started from is still mounted. Bounded, and it
 * writes only what the server returned — a delivery that never admits leaves
 * every cache exactly as it found it.
 */
async function trackStartedRun(queryClient: QueryClient, conversationId: string): Promise<void> {
  for (const delay of ADMISSION_DELAYS_MS) {
    await wait(delay);
    let conversation: TConversation;
    try {
      conversation = await dataService.getConversationById(conversationId);
    } catch (error) {
      if (isNotFoundError(error)) {
        continue;
      }
      return;
    }
    /** Warms the key the chat route reads, so opening the row it just added does
     *  not have to ask again. Absent-only: anything already cached under this id
     *  was put there by the chat itself and knows more than one list read does. */
    queryClient.setQueryData<TConversation>(
      [QueryKeys.conversation, conversationId],
      (current) => current ?? conversation,
    );
    upsertConvoInAllQueries(queryClient, conversation);
    /** A generation is live by definition here. The active-job list is the only
     *  thing that can mark the row as running, and it stops polling while nothing
     *  is listed — so re-arm it at admission, which is when a job exists, rather
     *  than at the click, which is before one does. */
    extendActiveJobsGrace();
    queryClient.invalidateQueries([QueryKeys.activeJobs]);
    return;
  }
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
        if (data.conversationId) {
          void trackStartedRun(queryClient, data.conversationId);
        }
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
