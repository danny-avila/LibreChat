import { useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TSchedule } from 'librechat-data-provider';
import { trackScheduledRun } from '~/data-provider/Schedules/admission';

type Occurrences = Pick<TSchedule, 'inFlight' | 'lastRun'>;

const inFlightChats = (schedule: Pick<TSchedule, 'inFlight'>): string[] =>
  (schedule.inFlight ?? []).map((run) => run.conversationId);

/** Everything about a schedule's occurrences that should send the list back to
 *  the server when it moves: which runs are generating, and how the last one
 *  ended. A run short enough to start and settle between two polls is never seen
 *  generating; it is still seen settled, and the refetch that follows brings its
 *  chat with the server's own row. */
const runState = (schedule: Occurrences): string => {
  const { lastRun } = schedule;
  const live = inFlightChats(schedule).sort().join(',');
  return `${live}|${lastRun?.conversationId ?? ''}:${lastRun?.status ?? ''}`;
};

/** What a schedule this client has never seen is compared against. One created
 *  elsewhere that arrives with its first run already settled is news the list
 *  should hear; one that arrives with no run yet is not. */
const IDLE_STATE = runState({});

/**
 * Puts an automatic occurrence's chat in the sidebar, the same way Run Now does.
 *
 * An automatic occurrence is the one generation nothing in this client starts, so
 * no submission, stream or event handler ever tells the sidebar its chat exists —
 * and the list's own five-minute staleness leaves it out of a tab that stays
 * focused. This panel's query is already polling for the cards, and it names the
 * chat each generating occurrence is producing, read from the run's own row rather
 * than inferred from the schedule. Every one is handed to the admission watch Run
 * Now uses, on every observation: that watch is the one place that decides whether
 * an id is landed, in flight, or — having given up on a delivery deferred past its
 * budget — worth trying again on a later announcement. Only generating runs are
 * ever handed over, so a settled run whose generation never wrote a conversation
 * is never watched, let alone watched again.
 *
 * When a run's state moves — one settles, its schedule is deleted from under it,
 * or a schedule created elsewhere arrives with a run already behind it — the list
 * is re-read once for the chat, order and title the settlement changed.
 * Because the state includes the generating occurrences, an owner editing the
 * schedule mid-flight (which fences the `lastRun` projection) still cannot hide a
 * settlement. The first observation is recorded in silence: a panel opened long
 * after a run must not refetch a list that has held its chat all along.
 */
export default function useRunSync(schedules?: TSchedule[]): void {
  const queryClient = useQueryClient();
  const states = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (schedules == null) {
      return;
    }
    const previous = states.current;
    const current = new Map<string, string>();
    for (const schedule of schedules) {
      current.set(schedule.id, runState(schedule));
      for (const conversationId of inFlightChats(schedule)) {
        void trackScheduledRun(queryClient, conversationId);
      }
    }
    states.current = current;
    if (previous == null) {
      return;
    }
    const moved =
      [...previous].some(([id, state]) => current.get(id) !== state) ||
      [...current].some(([id, state]) => !previous.has(id) && state !== IDLE_STATE);
    if (moved) {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    }
  }, [schedules, queryClient]);
}
