import { useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TSchedule } from 'librechat-data-provider';
import { trackScheduledRun } from '~/data-provider/Schedules/admission';

/** The chats a schedule names: those its running occurrences are producing, and
 *  the one its last occurrence produced. A run short enough to start and settle
 *  between two polls is never seen running; it is still seen settled. */
const namedChats = (schedule: TSchedule): string[] => {
  const ids = (schedule.activeRuns ?? []).map((run) => run.conversationId);
  if (schedule.lastRun?.conversationId != null) {
    ids.push(schedule.lastRun.conversationId);
  }
  return ids;
};

/** Everything about a schedule's occurrences that should send the list back to
 *  the server when it moves: which runs are live, and how the last one ended. */
const runState = (schedule: TSchedule): string => {
  const live = (schedule.activeRuns ?? []).map((run) => run.conversationId).sort();
  const { lastRun } = schedule;
  return `${live.join(',')}|${lastRun?.conversationId ?? ''}:${lastRun?.status ?? ''}`;
};

/**
 * Puts an automatic occurrence's chat in the sidebar, the same way Run Now does.
 *
 * An automatic occurrence is the one generation nothing in this client starts, so
 * no submission, stream or event handler ever tells the sidebar its chat exists —
 * and the list's own five-minute staleness leaves it out of a tab that stays
 * focused. This panel's query is already polling for the cards, and it names the
 * chats each schedule is producing and has produced, read from the run rows rather
 * than inferred from the schedule. Every chat it names that has not been seen is
 * handed to the admission watch Run Now uses, which is idempotent per id.
 *
 * The first observation is recorded in silence, except for occurrences still
 * running: a panel opened long after a run must not go and fetch history, but a
 * run in flight when it opens is exactly the chat the sidebar may lack.
 *
 * When a run's state moves — one settles, a pause resolves — the list is re-read
 * once for the order and title its settlement changed. Because the state includes
 * the live occurrences, an owner editing the schedule mid-flight (which fences the
 * `lastRun` projection) still cannot hide a settlement.
 */
export default function useRunSync(schedules?: TSchedule[]): void {
  const queryClient = useQueryClient();
  const seen = useRef<Set<string> | null>(null);
  const states = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (schedules == null) {
      return;
    }
    const first = seen.current == null;
    const known = (seen.current ??= new Set());
    let moved = false;
    for (const schedule of schedules) {
      const state = runState(schedule);
      const before = states.current.get(schedule.id);
      states.current.set(schedule.id, state);
      if (!first && before !== undefined && before !== state) {
        moved = true;
      }
      const inFlight = new Set((schedule.activeRuns ?? []).map((run) => run.conversationId));
      for (const conversationId of namedChats(schedule)) {
        if (known.has(conversationId)) {
          continue;
        }
        known.add(conversationId);
        if (!first || inFlight.has(conversationId)) {
          void trackScheduledRun(queryClient, conversationId);
        }
      }
    }
    if (moved) {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    }
  }, [schedules, queryClient]);
}
