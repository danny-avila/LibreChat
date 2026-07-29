import { useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useCancelSteerMutation } from '~/data-provider';
import store from '~/store';

/**
 * `reclaimed` — the cancel beat the boundary; the words never entered the run.
 * `applied` — the steer already injected (or the run ended): the events own it.
 * `failed` — the POST failed, so the entry is restored and the server may still
 * inject it.
 */
export type SteerCancelOutcome = 'reclaimed' | 'applied' | 'failed';

/**
 * Asks the server to drop a steer before its injection boundary, touching no
 * chip state — the caller owns what happens to the words.
 *
 * A steer leaves the server queue only by injecting, so only `reclaimed` proves
 * the words never entered the run and are still the client's to re-home. Giving
 * an `applied` steer a second life (queueing it, editing it back into the
 * composer) would say the same thing twice; on `failed` the server may still
 * inject it, so its fate is unknown and it must be left alone.
 */
export function useSteerReclaim(conversationId: string) {
  const cancelMutation = useCancelSteerMutation();

  return useCallback(
    async (steer: PendingSteer): Promise<SteerCancelOutcome> => {
      try {
        const { removed } = await cancelMutation.mutateAsync({
          conversationId,
          steerId: steer.steerId,
        });
        return removed === true ? 'reclaimed' : 'applied';
      } catch {
        return 'failed';
      }
    },
    [conversationId, cancelMutation],
  );
}

/**
 * Cancels a steer still waiting on its injection boundary. Optimistic: the
 * entry leaves the chip stack immediately; `removed: false` needs no handling
 * (the steer already injected or the run ended — the events own the outcome).
 * Only a failed POST restores the entry, since the server would still inject
 * the supposedly-cancelled words.
 */
export default function useSteerCancel(conversationId: string) {
  const reclaim = useSteerReclaim(conversationId);

  const removeEntry = useRecoilCallback(
    ({ set }) =>
      (steerId: string) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((item) => item.steerId !== steerId),
        );
      },
    [conversationId],
  );
  const restoreEntry = useRecoilCallback(
    ({ snapshot, set }) =>
      (entry: PendingSteer) => {
        /* A steer that settled while the POST was in flight — applied on the
         * server, or converted to a queued follow-up at run end — must NOT come
         * back. The next run (a queue drain auto-sends one) would render this
         * stale entry as an in-flight bubble beside its own queued copy. */
        const settled = snapshot
          .getLoadable(store.appliedSteerIdsByConvoId(conversationId))
          .getValue();
        if (settled.includes(entry.steerId)) {
          return;
        }
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.some((item) => item.steerId === entry.steerId) ? prev : [...prev, entry],
        );
      },
    [conversationId],
  );

  return useCallback(
    async (steer: PendingSteer): Promise<SteerCancelOutcome> => {
      removeEntry(steer.steerId);
      const outcome = await reclaim(steer);
      if (outcome === 'failed') {
        restoreEntry(steer);
      }
      return outcome;
    },
    [reclaim, removeEntry, restoreEntry],
  );
}
