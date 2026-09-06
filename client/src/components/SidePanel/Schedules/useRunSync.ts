import { useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TSchedule } from 'librechat-data-provider';
import { trackScheduledRun } from '~/data-provider/Schedules/admission';

/** Which chat each schedule is producing right now, by schedule id. */
const runningChats = (schedules: TSchedule[]): Map<string, string> => {
  const running = new Map<string, string>();
  for (const schedule of schedules) {
    if (schedule.activeRun != null) {
      running.set(schedule.id, schedule.activeRun.conversationId);
    }
  }
  return running;
};

/**
 * Puts an automatic occurrence's chat in the sidebar, the same way Run Now does.
 *
 * An automatic occurrence is the one generation nothing in this client starts, so
 * no submission, stream or event handler ever tells the sidebar its chat exists —
 * and the list's own five-minute staleness leaves it out of a tab that stays
 * focused. This panel's query is already polling for the cards, and it now names
 * the chat each running occurrence is producing (`activeRun`, read from the run's
 * own row), so every id it names is handed to the admission watch Run Now uses.
 * That watch is idempotent per id: a panel re-mounting mid-run, or a run announced
 * by both the click and the poll, watches once.
 *
 * A run leaving the list has settled. The watch already put its chat in the
 * sidebar and queued its title; what settlement changes is the conversation's
 * `updatedAt`, which orders it, so the list is re-read once. Because the signal is
 * the run row and not the schedule's `lastRun` projection, an owner editing the
 * schedule mid-flight — which fences that projection — cannot hide it. The first
 * observation is recorded in silence: a panel opened long after a run must not
 * refetch a list that has held its chat all along.
 */
export default function useRunSync(schedules?: TSchedule[]): void {
  const queryClient = useQueryClient();
  const observed = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (schedules == null) {
      return;
    }
    const current = runningChats(schedules);
    const previous = observed.current;
    observed.current = current;
    for (const conversationId of current.values()) {
      void trackScheduledRun(queryClient, conversationId);
    }
    if (previous == null) {
      return;
    }
    for (const [scheduleId, conversationId] of previous) {
      if (current.get(scheduleId) !== conversationId) {
        queryClient.invalidateQueries([QueryKeys.allConversations]);
        return;
      }
    }
  }, [schedules, queryClient]);
}
