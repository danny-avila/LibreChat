import { memo, useCallback } from 'react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useCancelSteerMutation } from '~/data-provider';
import { SteerPart } from './Parts';
import store from '~/store';

/**
 * Steers the server hasn't applied yet, rendered in-thread at the end of the
 * streaming assistant message — the projected injection point, since the next
 * tool-batch boundary is always after everything streamed so far. A submitted
 * steer is part of the history the moment it's sent; `on_steer_applied`
 * then drops the optimistic entry as the persisted part lands at its
 * authoritative index. Failed steers leave the thread for the composer's
 * recovery row (retry / edit / queue).
 */
const PendingSteers = memo(function PendingSteers({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  const convoKey = conversationId ?? '';
  const steers = useRecoilValue(store.pendingSteersByConvoId(convoKey));
  const cancelMutation = useCancelSteerMutation();

  const removeEntry = useRecoilCallback(
    ({ set }) =>
      (steerId: string) => {
        set(store.pendingSteersByConvoId(convoKey), (prev) =>
          prev.filter((item) => item.steerId !== steerId),
        );
      },
    [convoKey],
  );
  const restoreEntry = useRecoilCallback(
    ({ set }) =>
      (entry: PendingSteer) => {
        set(store.pendingSteersByConvoId(convoKey), (prev) =>
          prev.some((item) => item.steerId === entry.steerId) ? prev : [...prev, entry],
        );
      },
    [convoKey],
  );

  /** Optimistic: the entry leaves the thread immediately; `removed: false`
   *  needs no handling (the steer already injected or the run ended — the
   *  events own the outcome). Only a failed POST restores the entry, since
   *  the server would still inject the supposedly-cancelled words. */
  const cancelSteer = useCallback(
    (entry: PendingSteer) => {
      if (!conversationId) {
        return;
      }
      removeEntry(entry.steerId);
      cancelMutation.mutate(
        { conversationId, steerId: entry.steerId },
        { onError: () => restoreEntry(entry) },
      );
    },
    [conversationId, removeEntry, restoreEntry, cancelMutation],
  );

  if (steers.length === 0) {
    return null;
  }
  return (
    <>
      {steers.map((steer) =>
        steer.status === 'failed' ? null : (
          <SteerPart
            key={steer.steerId}
            steer={steer.text}
            files={steer.files}
            steerId={steer.steerId}
            createdAt={steer.createdAt}
            pending
            onCancel={steer.status === 'pending' ? () => cancelSteer(steer) : undefined}
          />
        ),
      )}
    </>
  );
});

export default PendingSteers;
