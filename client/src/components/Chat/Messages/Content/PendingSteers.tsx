import { memo, useCallback } from 'react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useCancelSteerMutation } from '~/data-provider';
import { SteerPart } from './Parts';
import store from '~/store';

/**
 * One not-yet-applied steer. Owns the cancel affordance so the mutation hook
 * (and its QueryClient requirement) only exists while a steer is actually
 * on screen — the parent slot renders on every streaming message.
 *
 * Cancel is optimistic: the entry leaves the thread immediately;
 * `removed: false` needs no handling (the steer already injected or the run
 * ended — the events own the outcome). Only a failed POST restores the
 * entry, since the server would still inject the supposedly-cancelled words.
 */
const PendingSteerItem = memo(function PendingSteerItem({
  steer,
  conversationId,
}: {
  steer: PendingSteer;
  conversationId: string;
}) {
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
    ({ set }) =>
      (entry: PendingSteer) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.some((item) => item.steerId === entry.steerId) ? prev : [...prev, entry],
        );
      },
    [conversationId],
  );

  const cancelSteer = useCallback(() => {
    removeEntry(steer.steerId);
    cancelMutation.mutate(
      { conversationId, steerId: steer.steerId },
      { onError: () => restoreEntry(steer) },
    );
  }, [conversationId, steer, removeEntry, restoreEntry, cancelMutation]);

  return (
    <SteerPart
      steer={steer.text}
      files={steer.files}
      steerId={steer.steerId}
      createdAt={steer.createdAt}
      pending
      onCancel={steer.status === 'pending' ? cancelSteer : undefined}
    />
  );
});

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
  if (steers.length === 0 || !conversationId) {
    return null;
  }
  return (
    <>
      {steers.map((steer) =>
        steer.status === 'failed' ? null : (
          <PendingSteerItem key={steer.steerId} steer={steer} conversationId={conversationId} />
        ),
      )}
    </>
  );
});

export default PendingSteers;
