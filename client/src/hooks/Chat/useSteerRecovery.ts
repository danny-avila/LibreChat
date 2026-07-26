import { useRecoilCallback } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useSteerMessageMutation } from '~/data-provider';
import store from '~/store';

/**
 * Retry or re-route a pending steer from OUTSIDE the composer. The thread's
 * pending block needs these two actions without dragging the whole
 * `SteeringControls` object through the message tree.
 */
export default function useSteerRecovery(conversationId: string) {
  const { mutate: steerMessage } = useSteerMessageMutation();

  const markSending = useRecoilCallback(
    ({ set }) =>
      (steerId: string, status: PendingSteer['status']) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.map((steer) => (steer.steerId === steerId ? { ...steer, status } : steer)),
        );
      },
    [conversationId],
  );

  const retry = useRecoilCallback(
    ({ snapshot }) =>
      (steerId: string) => {
        const steers = snapshot
          .getLoadable(store.pendingSteersByConvoId(conversationId))
          .getValue();
        const steer = steers.find((item) => item.steerId === steerId);
        if (!steer) {
          return;
        }
        markSending(steerId, 'sending');
        steerMessage(
          { conversationId, text: steer.text, files: steer.files },
          {
            onSuccess: () => markSending(steerId, 'pending'),
            onError: () => markSending(steerId, 'failed'),
          },
        );
      },
    [conversationId, steerMessage, markSending],
  );

  /** Move a failed steer into the queue: it sends when the reply finishes. */
  const sendAsNew = useRecoilCallback(
    ({ snapshot, set }) =>
      (steerId: string) => {
        const steers = snapshot
          .getLoadable(store.pendingSteersByConvoId(conversationId))
          .getValue();
        const steer = steers.find((item) => item.steerId === steerId);
        if (!steer) {
          return;
        }
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((item) => item.steerId !== steerId),
        );
        set(store.queuedMessagesByConvoId(conversationId), (prev) => [
          ...prev,
          {
            id: steer.steerId,
            text: steer.text,
            createdAt: steer.createdAt,
            files: steer.files,
            quotes: steer.quotes,
            manualSkills: steer.manualSkills,
          },
        ]);
      },
    [conversationId],
  );

  const remove = useRecoilCallback(
    ({ set }) =>
      (steerId: string) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((item) => item.steerId !== steerId),
        );
      },
    [conversationId],
  );

  return { retry, sendAsNew, remove };
}
