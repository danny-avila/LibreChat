import { useCallback, useMemo } from 'react';
import { useStore } from 'jotai';
import { useToastContext } from '@librechat/client';
import { blockRecovery, canRestoreRecovery, recoveryDisposition } from '@librechat/chat';
import type { QueuedMessage } from '@librechat/chat';
import type { QueuedTurnReceipts } from './receipts';
import type { QueueRows } from './rows';
import { useCancelSteerMutation, useCancelAgentQueuedTurnMutation } from '~/data-provider';
import { recoveryDispositionsFamily } from '~/components/Chat/Steering/recovery';
import { revealedQueuedTurnFamily } from '~/store/steer';
import useLocalize from '~/hooks/useLocalize';

/** Lets go of a queued row's server copy (a durable queued turn or a parked
 *  steer receipt) before the row is edited, removed or sent another way. */
export default function useQueuedRecovery({
  queueKey,
  conversationId,
  hasRealConvoId,
  applyQueuedTurnReceipts,
  downgradeServerQueuedTurn,
  removeQueued,
}: {
  queueKey: string;
  conversationId: string;
  hasRealConvoId: boolean;
  applyQueuedTurnReceipts: QueuedTurnReceipts['applyQueuedTurnReceipts'];
  downgradeServerQueuedTurn: QueueRows['downgradeServerQueuedTurn'];
  removeQueued: QueueRows['removeQueued'];
}) {
  const localize = useLocalize();
  const jotaiStore = useStore();
  const { showToast } = useToastContext();
  const { mutateAsync: cancelSteer } = useCancelSteerMutation();
  const { mutateAsync: cancelAgentQueuedTurn } = useCancelAgentQueuedTurnMutation();
  /** Settle a queued row's terminal recovery source before an Edit/Remove.
   * Ordinary rows have no server copy. A v2 leftover first uses its durable
   * receipt to atomically discard the parked copy, then becomes an ordinary
   * local row; the caller decides whether the live composer can consume it.
   * The cancel deliberately omits the active epoch: the receipt belongs to the
   * terminal source generation, not whichever run now occupies the chat. */
  const discardQueued = useCallback(
    async (item: QueuedMessage): Promise<boolean> => {
      if (item.server != null) {
        if (item.server.status === 'rejected' && item.server.id == null) {
          return downgradeServerQueuedTurn(item.id);
        }
        if (item.server.id == null || !hasRealConvoId) {
          showToast({
            message: localize('com_ui_steer_cancel_failed'),
            status: 'error',
          });
          return false;
        }
        try {
          const receipt = await cancelAgentQueuedTurn({
            conversationId,
            queuedTurnId: item.server.id,
          });
          if (receipt.status !== 'cancelled') {
            showToast({
              message: localize('com_ui_steer_cancel_failed'),
              status: 'error',
            });
            return false;
          }
          applyQueuedTurnReceipts([receipt], 'direct');
          /** The turn was shown as next; the confirmed cancellation ends that
           *  at once rather than on the next receipt refetch. */
          const revealFamily = revealedQueuedTurnFamily(queueKey);
          if (jotaiStore.get(revealFamily)?.clientRequestId === item.clientRequestId) {
            jotaiStore.set(revealFamily, null);
          }
          return downgradeServerQueuedTurn(item.id);
        } catch {
          showToast({
            message: localize('com_ui_steer_cancel_failed'),
            status: 'error',
          });
          return false;
        }
      }
      if (item.recoverySteerId == null) {
        return true;
      }
      if (item.recoveryClientSteerId == null || !hasRealConvoId) {
        jotaiStore.set(recoveryDispositionsFamily(queueKey), (previous) =>
          blockRecovery(previous, item.recoverySteerId!),
        );
        showToast({
          message: localize('com_ui_steer_cancel_failed'),
          status: 'error',
        });
        return false;
      }
      const dispositions = recoveryDispositionsFamily(queueKey);
      const disposition = recoveryDisposition(jotaiStore.get(dispositions), item);
      if (disposition === 'cancelled') {
        return true;
      }
      if (disposition === 'cancelling') {
        return false;
      }
      if (!canRestoreRecovery(jotaiStore.get(dispositions), item)) {
        return false;
      }
      const steerId = item.recoverySteerId;
      jotaiStore.set(dispositions, (previous) => ({ ...previous, [steerId]: 'cancelling' }));
      try {
        const { removed } = await cancelSteer({
          conversationId,
          steerId,
          clientSteerId: item.recoveryClientSteerId,
        });
        if (removed !== true) {
          showToast({
            message: localize('com_ui_steer_cancel_failed'),
            status: 'error',
          });
          return false;
        }
        jotaiStore.set(dispositions, (previous) => ({ ...previous, [steerId]: 'cancelled' }));
        // Keep the binding held until the caller's guarded Edit/Remove succeeds.
        // A newer composer draft must not turn cancelled words into an auto-send.
        return true;
      } catch {
        showToast({
          message: localize('com_ui_steer_cancel_failed'),
          status: 'error',
        });
        return false;
      } finally {
        jotaiStore.set(dispositions, (previous) =>
          previous[steerId] === 'cancelling' ? { ...previous, [steerId]: 'blocked' } : previous,
        );
      }
    },
    [
      cancelSteer,
      cancelAgentQueuedTurn,
      applyQueuedTurnReceipts,
      conversationId,
      downgradeServerQueuedTurn,
      hasRealConvoId,
      localize,
      showToast,
      jotaiStore,
      queueKey,
    ],
  );

  const dismissRecovery = useCallback(
    (item: QueuedMessage) => {
      const dispositions = recoveryDispositionsFamily(queueKey);
      if (
        item.recoverySteerId == null ||
        !['blocked', 'cancelled'].includes(
          recoveryDisposition(jotaiStore.get(dispositions), item) ?? '',
        )
      ) {
        return;
      }
      const steerId = item.recoverySteerId;
      jotaiStore.set(dispositions, (previous) => ({ ...previous, [steerId]: 'dismissed' }));
      removeQueued(item.id);
    },
    [jotaiStore, queueKey, removeQueued],
  );

  return useMemo(
    () => ({
      discardQueued,
      dismissRecovery,
    }),
    [discardQueued, dismissRecovery],
  );
}

export type QueuedRecovery = ReturnType<typeof useQueuedRecovery>;
