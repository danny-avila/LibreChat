import { useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import type { Snapshot } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { getSteerErrorCode, resolveAcknowledgedSteer } from '~/hooks/Chat/useSteering';
import useSteerConvert from '~/hooks/Chat/useSteerConvert';
import { useSteerMessageMutation } from '~/data-provider';
import { carriedSteerContext } from '~/utils';
import store from '~/store';

/**
 * Retry or re-route a pending steer from OUTSIDE the composer. The thread's
 * pending block needs these actions without dragging the whole
 * `SteeringControls` object through the message tree.
 */
export default function useSteerRecovery(conversationId: string) {
  const { mutateAsync: steerMessage } = useSteerMessageMutation();
  const convertSteersToQueued = useSteerConvert();

  /** Whether the run this steer belongs to has finished, read live at ack time.
   *  Unmounting is not the same signal: `PendingSteers` also unmounts when the
   *  user navigates away from a run that is still going, and treating that as
   *  the end queued the accepted steer as a follow-up on top of the injection
   *  the server was already making. */
  const isRunOver = useCallback(
    (snapshot: Snapshot) => {
      const keys = snapshot.getLoadable(store.conversationKeysAtom).getValue();
      for (const key of keys) {
        const convo = snapshot.getLoadable(store.conversationByIndex(key)).getValue();
        if (convo?.conversationId !== conversationId) {
          continue;
        }
        return snapshot.getLoadable(store.isSubmittingFamily(key)).getValue() !== true;
      }
      return true;
    },
    [conversationId],
  );

  const markStatus = useRecoilCallback(
    ({ set }) =>
      (steerId: string, status: PendingSteer['status']) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.map((steer) => (steer.steerId === steerId ? { ...steer, status } : steer)),
        );
      },
    [conversationId],
  );

  const acknowledgeRetry = useRecoilCallback(
    (cbInterface) => (localId: string, steer: PendingSteer) => {
      resolveAcknowledgedSteer(
        cbInterface,
        conversationId,
        localId,
        steer,
        isRunOver(cbInterface.snapshot),
      );
    },
    [conversationId, isRunOver],
  );

  /** Routes a steer straight into the queue: reused for a retry that degrades
   *  (no active run / paused / unsupported / queue full) and for `sendAsNew`,
   *  so both get the same id-dedup, chronological merge, and applied-id
   *  bookkeeping as every other steer-to-queue conversion — instead of a
   *  blind append that a late ACK could still re-mint a chip for. */
  const queueSteer = useCallback(
    (steer: PendingSteer) => {
      convertSteersToQueued(conversationId, [
        {
          steerId: steer.steerId,
          text: steer.text,
          createdAt: steer.createdAt,
          ...(steer.files && steer.files.length > 0 && { files: steer.files }),
          ...carriedSteerContext(steer),
        },
      ]);
    },
    [conversationId, convertSteersToQueued],
  );

  const retry = useRecoilCallback(
    ({ snapshot }) =>
      (steerId: string) => {
        const steer = snapshot
          .getLoadable(store.pendingSteersByConvoId(conversationId))
          .getValue()
          .find((item) => item.steerId === steerId);
        if (!steer) {
          return;
        }
        markStatus(steerId, 'sending');
        /* Resolved through the promise rather than through `mutate`'s
           per-call callbacks, which react-query drops once the observer has no
           listeners. This hook lives in the block that unmounts the moment the
           run ends, which is exactly when a retry's ack tends to land: those
           callbacks never ran, and the chip was left saying `sending` for the
           rest of the conversation with the words neither sent nor queued. */
        steerMessage({ conversationId, text: steer.text, files: steer.files })
          .then((response) => {
            acknowledgeRetry(steerId, { ...steer, steerId: response.steerId, status: 'pending' });
          })
          .catch((error: unknown) => {
            const code = getSteerErrorCode(error);
            // The run ended, is paused, or can't accept a steer right now —
            // none of that means the words are lost, just that a queued
            // follow-up is the only way left to send them.
            if (
              code === 'NO_ACTIVE_RUN' ||
              code === 'RUN_PAUSED' ||
              code === 'STEER_UNSUPPORTED' ||
              code === 'STEER_QUEUE_FULL'
            ) {
              queueSteer(steer);
              return;
            }
            markStatus(steerId, 'failed');
          });
      },
    [conversationId, steerMessage, markStatus, acknowledgeRetry, queueSteer],
  );

  /** Move a failed steer into the queue: it sends when the reply finishes. */
  const sendAsNew = useRecoilCallback(
    ({ snapshot }) =>
      (steerId: string) => {
        const steer = snapshot
          .getLoadable(store.pendingSteersByConvoId(conversationId))
          .getValue()
          .find((item) => item.steerId === steerId);
        if (!steer) {
          return;
        }
        queueSteer(steer);
      },
    [conversationId, queueSteer],
  );

  return { retry, sendAsNew };
}
