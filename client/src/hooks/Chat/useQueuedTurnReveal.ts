import { useCallback, useEffect } from 'react';
import { useStore, useAtomValue } from 'jotai';
import { QueryKeys } from 'librechat-data-provider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TMessage, TAgentQueuedTurnReceipt } from 'librechat-data-provider';
import type { QueuedMessage, RunEnd } from '~/store/families';
import type { RevealedQueuedTurn } from '~/store/steer';
import { revealedQueuedTurnFamily } from '~/store/steer';
import { useAgentQueuedTurns } from '~/data-provider';

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
  if (end.outcome !== 'completed' || end.responseMessageId == null) {
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

/**
 * Shows a server-owned queued follow-up as the newest user turn the moment
 * its predecessor completes, instead of after the receipt poll, the active
 * job poll and the resume attach have each had their turn.
 *
 * The reveal is presentation intent, not a message: `PendingTurn` renders it
 * after the completed response while that response is the thread's tail, and
 * the composer, the generation controls and the chip read the same intent to
 * queue behind it. Nothing enters the message cache, so the server's own copy
 * of the turn needs no reconciliation: once anything parents on the response
 * (the admitted turn arriving through attach, sync or refetch, or another
 * client's turn) the intent ends. A cancelled, dead or indeterminate receipt
 * ends it too, and the chip regains its actions.
 */
export default function useQueuedTurnReveal(
  conversationId: string | undefined,
  getMessages: () => TMessage[] | undefined,
): (item: QueuedMessage, end: RunEnd) => void {
  const jotaiStore = useStore();
  const queryClient = useQueryClient();
  const revealKey = conversationId ?? '';
  const reveal = useAtomValue(revealedQueuedTurnFamily(revealKey));
  const { data: receipts } = useAgentQueuedTurns(revealKey, false);
  const historyKey = [QueryKeys.messages, revealKey];
  const selectSuccessorSeen = useCallback(
    (messages: TMessage[]) => reveal != null && hasRevealSuccessor(messages, reveal),
    [reveal],
  );
  const { data: successorSeen } = useQuery<TMessage[], unknown, boolean>(
    historyKey,
    async () => queryClient.getQueryData<TMessage[]>(historyKey) ?? [],
    { enabled: false, select: selectSuccessorSeen },
  );

  const revealQueuedTurn = useCallback(
    (item: QueuedMessage, end: RunEnd) => {
      const target = end.conversationId;
      if (
        target == null ||
        target !== conversationId ||
        end.responseMessageId == null ||
        item.clientRequestId == null
      ) {
        return;
      }
      const family = revealedQueuedTurnFamily(target);
      if (jotaiStore.get(family) != null) {
        return;
      }
      const parentMessageId = end.responseMessageId;
      /** Admission can outrun the terminal signal: the turn is already in
       *  history, so there is nothing left to anticipate. */
      if ((getMessages() ?? []).some((message) => message.parentMessageId === parentMessageId)) {
        return;
      }
      jotaiStore.set(family, {
        clientRequestId: item.clientRequestId,
        parentMessageId,
        text: item.text,
        ...(item.files != null && item.files.length > 0 && { files: item.files }),
        ...(item.quotes != null && item.quotes.length > 0 && { quotes: item.quotes }),
        ...(item.manualSkills != null &&
          item.manualSkills.length > 0 && { manualSkills: item.manualSkills }),
        revealedAt: new Date().toISOString(),
      });
    },
    [conversationId, getMessages, jotaiStore],
  );

  useEffect(() => {
    if (reveal == null || conversationId == null) {
      return;
    }
    const ended =
      successorSeen === true || (Array.isArray(receipts) && shouldRollbackReveal(receipts, reveal));
    if (ended) {
      jotaiStore.set(revealedQueuedTurnFamily(conversationId), null);
    }
  }, [conversationId, jotaiStore, receipts, reveal, successorSeen]);

  return revealQueuedTurn;
}
