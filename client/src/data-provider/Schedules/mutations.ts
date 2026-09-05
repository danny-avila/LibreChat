/* Scheduled chats */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  TUser,
  TSchedule,
  TConversation,
  TCreateSchedule,
  TUpdateSchedule,
  TScheduleRunNowResponse,
} from 'librechat-data-provider';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { extendActiveJobsGrace, queueTitleGeneration } from '~/data-provider/SSE/queries';
import { upsertConvoInAllQueries, getResponseStatus } from '~/utils';

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
 * Waits before each probe, so the first is not spent on a conversation that
 * cannot exist yet. Admission is normally a second or two, but a dispatch that
 * keeps failing is retried, and the budget has to outlast that or the watch
 * gives up on a run the server is still going to admit: the trigger engine
 * allows eight attempts backing off from a second and doubling, which is about
 * two minutes of retries in the worst case. Roughly five minutes of probes
 * covers that window twice over in eleven requests.
 *
 * It does not cover everything, deliberately. A dispatch refused with a long
 * `Retry-After` can be re-driven hours later, and holding a watch open for that
 * is worse than what already happens without one — the chat arrives with the
 * next list refetch, which is what an automatic occurrence relies on anyway.
 */
const ADMISSION_DELAYS_MS = [
  750, 1_500, 3_000, 6_000, 10_000, 15_000, 30_000, 45_000, 60_000, 60_000, 60_000,
];

/** 404 is the run not having started yet, which is the whole reason for waiting.
 *  408 and 429 ask to be retried by definition, and a proxy in front of the app
 *  can raise either without the run being involved at all. */
const RETRYABLE_CLIENT_STATUS = new Set([404, 408, 429]);

/**
 * Whether a failed probe has answered the question for good. A 5xx, or a request
 * that never got a response, has not — those are the probe failing rather than the
 * run, and the durable delivery is still free to admit afterwards. Only a client
 * error that is not asking to be retried settles it: waiting longer will not make
 * this client able to read that conversation.
 */
const isTerminalProbeFailure = (error: unknown): boolean => {
  const status = getResponseStatus(error);
  return status != null && status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUS.has(status);
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Who this cache belongs to. Both sign-in and sign-out empty it wholesale, so a
 *  watch outliving either has no business writing to whatever replaced it.
 *
 *  `undefined` is two different things, and the difference decides the fence: not
 *  loaded yet, or emptied. Which one it is depends on whether an owner has been
 *  seen before — see {@link trackStartedRun}. */
const cacheOwner = (queryClient: QueryClient): string | undefined =>
  queryClient.getQueryData<TUser>([QueryKeys.user])?.id;

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
 * A probe that fails keeps the watch alive unless the failure settles the matter;
 * see {@link isTerminalProbeFailure}.
 *
 * Deliberately detached from the caller: the sidebar has to gain the chat whether
 * or not the panel the run was started from is still mounted. Bounded, and it
 * writes only what the server returned — a delivery that never admits leaves
 * every cache exactly as it found it.
 */
async function trackStartedRun(queryClient: QueryClient, conversationId: string): Promise<void> {
  /** Bound late when the user query has not resolved yet. Run-now answering 200 is
   *  itself proof that a session existed at the click, so an empty entry then is a
   *  cache still loading rather than nobody signed in — reading it as a session
   *  change would abandon the watch the moment the account's own query arrived. */
  let startedFor = cacheOwner(queryClient);
  for (const delay of ADMISSION_DELAYS_MS) {
    await wait(delay);
    /** Minutes can pass in here, and signing out or signing in as someone else
     *  empties the cache in between. Re-check before probing and again before
     *  writing, or a late response files one user's chat in another's sidebar. */
    const owner = cacheOwner(queryClient);
    if (startedFor === undefined) {
      startedFor = owner;
    } else if (owner !== startedFor) {
      return;
    }
    let conversation: TConversation;
    try {
      conversation = await dataService.getConversationById(conversationId);
    } catch (error) {
      if (isTerminalProbeFailure(error)) {
        return;
      }
      continue;
    }
    /** An owner that is still unknown cannot be compared, so it cannot be cleared
     *  either — "loading" and "changed hands" are the same reading. Refuse the
     *  write rather than risk seeding one account's chat into another's sidebar;
     *  a signed-in session is what every caller of this actually has. */
    if (cacheOwner(queryClient) !== startedFor || startedFor === undefined) {
      return;
    }
    /** The conversation route serves an archived chat; the list query filters one
     *  out. Another tab archiving this run between its first write and this probe
     *  would otherwise put a row in the sidebar that no refetch agrees belongs
     *  there — and the archive was deliberate, so there is nothing else to do. */
    if (conversation.isArchived === true) {
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
    /** A conversation admitted mid-run has not been titled yet, so the row lands
     *  as "New Chat". The foreground paths hand that to the title queue, which
     *  owns the timing the server was configured for; a scheduled run has no
     *  foreground path, so hand it over here rather than leaving the placeholder
     *  until an unrelated refetch. */
    queueTitleGeneration(conversationId);
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
