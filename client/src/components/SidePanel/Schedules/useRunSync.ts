import { useRef, useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TSchedule } from 'librechat-data-provider';

/**
 * A schedule's occurrence state, reduced to what the conversation list depends on.
 *
 * `lastRun` alone is not enough, and reading it as the fire signal was wrong: the
 * fire path reserves its run row in the `ScheduleRun` collection, and the schedule
 * document's own `lastRun` is not projected onto it until the run settles, pauses
 * or skips. Keying on that missed the fire entirely, so a long-running scheduled
 * chat stayed out of the sidebar until it finished.
 *
 * `nextRunAt` is what actually moves when an automatic occurrence fires — every
 * fire advances it, before anything else about the schedule changes — and it is
 * served with the list. A manual run deliberately does not advance it, which is
 * the right split: Run Now is tracked to its own admission by the mutation that
 * started it, and needs nothing from here until its title lands.
 *
 * An owner editing the cadence also moves `nextRunAt`. That costs one refetch of
 * a list the edit did not change, which is cheaper than missing a fire.
 */
const occurrenceSignature = (schedule: TSchedule): string => {
  const { lastRun } = schedule;
  const settled =
    lastRun == null ? '' : `${lastRun.firedAt}:${lastRun.status}:${lastRun.conversationId ?? ''}`;
  return `${schedule.nextRunAt ?? ''}|${settled}`;
};

/**
 * Refreshes the conversation list when a schedule's run fires or settles.
 *
 * An automatic occurrence is the one generation nothing in this client starts,
 * so no submission, stream or event handler ever tells the sidebar its chat
 * exists — and the list's own five-minute staleness leaves it out of a tab that
 * stays focused. This panel's query is already polling for the cards, and what it
 * serves moves at exactly the two moments the list should be re-read: a fire adds
 * a chat, and a settlement is when the title generated for it lands. So the
 * refresh rides that poll instead of adding one of its own.
 *
 * Only TRANSITIONS refresh, and a schedule first seen here is recorded in
 * silence: a panel opened long after a run must not refetch a list that has
 * held its chat all along.
 */
export default function useRunSync(schedules?: TSchedule[]): void {
  const queryClient = useQueryClient();
  const observed = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (schedules == null) {
      return;
    }
    const current = new Map(
      schedules.map((schedule) => [schedule.id, occurrenceSignature(schedule)]),
    );
    const previous = observed.current;
    observed.current = current;
    if (previous == null) {
      return;
    }
    for (const [id, signature] of current) {
      const before = previous.get(id);
      if (before !== undefined && before !== signature) {
        /** One refetch answers every schedule that moved in the same tick, and
         *  the prefix reaches the project-scoped variants a run may be filed in. */
        queryClient.invalidateQueries([QueryKeys.allConversations]);
        return;
      }
    }
  }, [schedules, queryClient]);
}
