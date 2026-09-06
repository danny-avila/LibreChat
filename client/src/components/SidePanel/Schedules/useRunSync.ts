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
 * than inferred from the schedule. Every chat it names is handed to the admission
 * watch Run Now uses on every observation: that watch is the one place that
 * decides whether an id is already landed, in flight, or — having given up on a
 * delivery deferred past its budget — worth trying again on a later announcement.
 *
 * The exception is history. A panel opened long after a run must not go and fetch
 * chats that were listed before it opened, so whatever the first observation names
 * that is not actually generating — the last settled occurrence, and a pause that
 * may sit on its approval indefinitely — is never handed over. A pause resolving
 * later still re-reads the list, below.
 *
 * When a run's state moves — one settles, a pause resolves — the list is re-read
 * once for the order and title its settlement changed. Because the state includes
 * the live occurrences, an owner editing the schedule mid-flight (which fences the
 * `lastRun` projection) still cannot hide a settlement.
 */
export default function useRunSync(schedules?: TSchedule[]): void {
  const queryClient = useQueryClient();
  const history = useRef<Set<string> | null>(null);
  const states = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (schedules == null) {
      return;
    }
    const first = history.current == null;
    const skip = (history.current ??= new Set());
    let moved = false;
    for (const schedule of schedules) {
      const state = runState(schedule);
      const before = states.current.get(schedule.id);
      states.current.set(schedule.id, state);
      if (!first && before !== undefined && before !== state) {
        moved = true;
      }
      if (first) {
        const generating = new Set(
          (schedule.activeRuns ?? [])
            .filter((run) => run.status === 'started')
            .map((run) => run.conversationId),
        );
        for (const conversationId of namedChats(schedule)) {
          if (!generating.has(conversationId)) {
            skip.add(conversationId);
          }
        }
      }
      for (const conversationId of namedChats(schedule)) {
        if (!skip.has(conversationId)) {
          void trackScheduledRun(queryClient, conversationId);
        }
      }
    }
    if (moved) {
      queryClient.invalidateQueries([QueryKeys.allConversations]);
    }
  }, [schedules, queryClient]);
}
