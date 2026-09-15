import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useRecoilValue } from 'recoil';
import { useStore, useAtomValue } from 'jotai';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TMessage, TAgentQueuedTurnReceipt } from 'librechat-data-provider';
import type { StreamStatusResponse } from '~/data-provider/SSE/queries';
import type { QueuedMessage, RunEnd } from '~/store/families';
import type { RevealedQueuedTurn } from '~/store/steer';
import { agentQueuedTurnsQueryKey } from '~/data-provider/SSE/queuedTurns';
import { streamStatusQueryKey } from '~/data-provider/SSE/queries';
import { revealedQueuedTurnFamily } from '~/store/steer';
import store from '~/store';

const isAdmissible = (item: QueuedMessage): boolean =>
  item.server?.id != null &&
  item.clientRequestId != null &&
  (item.server.status === 'queued' || item.server.status === 'claimed');

/**
 * The server-owned row the backend will admit behind a run that just
 * completed cleanly: the first durably enqueued row that has not settled.
 * Rows ahead of it never stand in for the successor: a local row cannot
 * drain while the server owns the boundary, and a rejected or still-sending
 * server row is not what the backend will admit. A Stop or an error leaves
 * every chip in place.
 */
export const selectQueuedTurnReveal = (
  end: RunEnd,
  queue: QueuedMessage[],
): QueuedMessage | null => {
  if (
    end.outcome !== 'completed' ||
    end.responseMessageId == null ||
    end.generationCreatedAt == null
  ) {
    return null;
  }
  return queue.find(isAdmissible) ?? null;
};

/** The thread has moved past the response the reveal follows: the admitted
 *  turn, or any other turn, now parents on it. */
export const hasRevealSuccessor = (messages: TMessage[], reveal: RevealedQueuedTurn): boolean =>
  messages.some((message) => message.parentMessageId === reveal.parentMessageId);

/** Authoritative evidence that the revealed turn will not run as shown. */
export const shouldRollbackReveal = (
  receipts: TAgentQueuedTurnReceipt[],
  reveal: RevealedQueuedTurn,
): boolean =>
  receipts.some(
    (receipt) =>
      receipt.clientRequestId === reveal.clientRequestId &&
      (receipt.status === 'cancelled' ||
        receipt.status === 'dead' ||
        receipt.failure?.code === 'ADMISSION_INDETERMINATE'),
  );

/** A render-only message for the revealed row: it feeds the same row
 *  primitives a persisted user turn uses and is never written to the cache. */
export const buildRevealedMessage = (
  reveal: RevealedQueuedTurn,
  conversationId: string,
): TMessage =>
  ({
    messageId: `revealed-${reveal.clientRequestId}`,
    parentMessageId: reveal.parentMessageId,
    conversationId,
    text: reveal.text,
    sender: 'User',
    isCreatedByUser: true,
    error: false,
    clientTimestamp: reveal.revealedAt,
    ...(reveal.files != null && reveal.files.length > 0 && { files: reveal.files }),
    ...(reveal.quotes != null && reveal.quotes.length > 0 && { quotes: reveal.quotes }),
    ...(reveal.manualSkills != null &&
      reveal.manualSkills.length > 0 && { manualSkills: reveal.manualSkills }),
  }) as TMessage;

/** Presentation and admission have separate lifetimes: history replaces the
 * drawn row, but sends stay queued until the successor attaches or terminates.
 * Observe existing caches without registering a competing query function. */
export default function useQueuedTurnReveal(
  conversationId: string | undefined,
  index: string | number = 0,
): (item: QueuedMessage, end: RunEnd) => void {
  const jotaiStore = useStore();
  const queryClient = useQueryClient();
  const revealKey = conversationId ?? '';
  const reveal = useAtomValue(revealedQueuedTurnFamily(revealKey));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const activeEpoch = useRecoilValue(store.activeGenerationCreatedAtByConvoId(revealKey));
  const isSettled = useCallback(
    (intent: RevealedQueuedTurn) => {
      const receipts = queryClient.getQueryData<TAgentQueuedTurnReceipt[]>(
        agentQueuedTurnsQueryKey(revealKey),
      );
      const status = queryClient.getQueryData<StreamStatusResponse>(
        streamStatusQueryKey(revealKey),
      );
      return (
        (receipts != null && shouldRollbackReveal(receipts, intent)) ||
        (intent.generationCreatedAt != null &&
          ((isSubmitting && activeEpoch != null && activeEpoch > intent.generationCreatedAt) ||
            (status?.active === false &&
              (status.status === 'complete' ||
                status.status === 'error' ||
                status.status === 'aborted') &&
              status.createdAt != null &&
              status.createdAt > intent.generationCreatedAt)))
      );
    },
    [queryClient, revealKey, isSubmitting, activeEpoch],
  );
  const subscribe = useCallback(
    (notify: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        const key = event?.query.queryKey;
        if (
          key?.[1] === revealKey &&
          (key[0] === QueryKeys.agentQueuedTurns || key[0] === 'streamStatus')
        ) {
          notify();
        }
      }),
    [queryClient, revealKey],
  );
  const getSnapshot = useCallback(() => reveal != null && isSettled(reveal), [reveal, isSettled]);
  const settled = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const revealQueuedTurn = useCallback(
    (item: QueuedMessage, end: RunEnd) => {
      const target = end.conversationId;
      if (
        target == null ||
        target !== conversationId ||
        end.outcome !== 'completed' ||
        end.responseMessageId == null ||
        end.generationCreatedAt == null ||
        item.clientRequestId == null ||
        !isAdmissible(item)
      ) {
        return;
      }
      const family = revealedQueuedTurnFamily(target);
      if (jotaiStore.get(family) != null) {
        return;
      }
      const intent: RevealedQueuedTurn = {
        clientRequestId: item.clientRequestId,
        parentMessageId: end.responseMessageId,
        generationCreatedAt: end.generationCreatedAt,
        text: item.text,
        ...(item.files != null && item.files.length > 0 && { files: item.files }),
        ...(item.quotes != null && item.quotes.length > 0 && { quotes: item.quotes }),
        ...(item.manualSkills != null &&
          item.manualSkills.length > 0 && { manualSkills: item.manualSkills }),
        revealedAt: new Date().toISOString(),
      };
      if (!isSettled(intent)) {
        jotaiStore.set(family, intent);
      }
    },
    [conversationId, isSettled, jotaiStore],
  );

  useEffect(() => {
    if (settled && jotaiStore.get(revealedQueuedTurnFamily(revealKey)) === reveal) {
      jotaiStore.set(revealedQueuedTurnFamily(revealKey), null);
    }
  }, [jotaiStore, revealKey, reveal, settled]);

  return revealQueuedTurn;
}
