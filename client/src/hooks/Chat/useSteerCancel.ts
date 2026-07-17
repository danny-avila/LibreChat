import { useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useCancelSteerMutation } from '~/data-provider';
import store from '~/store';

/**
 * Cancels a steer still waiting on its injection boundary. Optimistic: the
 * entry leaves the chip stack immediately; `removed: false` needs no handling
 * (the steer already injected or the run ended — the events own the outcome).
 * Only a failed POST restores the entry, since the server would still inject
 * the supposedly-cancelled words.
 */
export default function useSteerCancel(conversationId: string) {
  const cancelMutation = useCancelSteerMutation();

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
    (steer: PendingSteer) => {
      removeEntry(steer.steerId);
      cancelMutation.mutate(
        { conversationId, steerId: steer.steerId },
        { onError: () => restoreEntry(steer) },
      );
    },
    [conversationId, removeEntry, restoreEntry, cancelMutation],
  );
}
