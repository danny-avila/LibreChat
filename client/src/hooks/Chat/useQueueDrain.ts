import { useEffect } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { QueuedMessage } from '~/store/families';
import type { TAskFunction } from '~/common';
import store from '~/store';

/**
 * Auto-sends queued follow-up messages when a run finishes.
 *
 * Consumes the one-shot `runEndByIndex` signal written by the SSE handlers.
 * Rules:
 * - Drains only on a clean completion — a user Stop or an error leaves the
 *   queued chips for manual send, EXCEPT when the one-shot
 *   `drainAfterAbortByIndex` flag was armed by "interrupt & send".
 * - Waits for `isSubmitting` to be false so `ask()` isn't dropped by its
 *   in-flight guard (`useChatFunctions.ask` early-returns while submitting).
 * - Dequeues ONE message per run end: the new turn's own final event drains
 *   the next, so multi-message queues send FIFO in sequence.
 * - Migrates a queue keyed under `NEW_CONVO` to the real conversation id when
 *   the finished run started as a new-conversation submission.
 */
export default function useQueueDrain(
  index: string | number,
  activeConversationId: string | undefined,
  ask: TAskFunction,
) {
  const runEnd = useRecoilValue(store.runEndByIndex(index));
  const parkedRunEnd = useRecoilValue(
    store.pendingRunEndByConvoId(activeConversationId ?? Constants.NEW_CONVO),
  );
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));

  // Fully synchronous reads (getLoadable): a useRecoilCallback snapshot is
  // only guaranteed valid for the callback's synchronous execution, so no
  // awaits may interleave with the reads.
  const drainNext = useRecoilCallback(
    ({ snapshot, set }) =>
      (): { next: QueuedMessage; conversationId: string } | null => {
        let end = snapshot.getLoadable(store.runEndByIndex(index)).getValue();
        let fromParked = false;
        if (
          end != null &&
          end.conversationId != null &&
          end.conversationId !== activeConversationId
        ) {
          /**
           * `ask` is the MOUNTED view's sender — draining another
           * conversation's follow-up here would submit it into the wrong
           * chat. Park the signal under ITS conversation (freeing the shared
           * index slot so a later run cannot overwrite it) and drain when
           * the user returns. The armed interrupt flag travels WITH the
           * parked signal: leaving it on the index would let another run on
           * this pane consume it (or drain the wrong conversation).
           */
          const armedNow = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
          if (armedNow) {
            set(store.drainAfterAbortByIndex(index), false);
          }
          set(store.pendingRunEndByConvoId(end.conversationId), {
            ...end,
            ...(armedNow && { interruptArmed: true }),
          });
          set(store.runEndByIndex(index), null);
          end = null;
        }
        if (end == null && activeConversationId) {
          const parked = snapshot
            .getLoadable(store.pendingRunEndByConvoId(activeConversationId))
            .getValue();
          if (parked != null) {
            end = parked;
            fromParked = true;
          }
        }
        if (end == null) {
          return null;
        }
        // Consume the signal first — a hard double-fire guard even if the
        // effect re-runs before Recoil propagates.
        if (fromParked && activeConversationId) {
          set(store.pendingRunEndByConvoId(activeConversationId), null);
        } else {
          set(store.runEndByIndex(index), null);
        }

        const indexArmed = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
        if (indexArmed) {
          set(store.drainAfterAbortByIndex(index), false);
        }
        const interruptArmed = indexArmed || end.interruptArmed === true;

        const conversationId = end.conversationId;
        if (!conversationId) {
          return null;
        }

        const shouldMigrate =
          end.startedAsNewConvo === true && conversationId !== Constants.NEW_CONVO;
        const newConvoQueue = shouldMigrate
          ? snapshot.getLoadable(store.queuedMessagesByConvoId(Constants.NEW_CONVO)).getValue()
          : [];
        const ownQueue = snapshot
          .getLoadable(store.queuedMessagesByConvoId(conversationId))
          .getValue();
        const merged = [...newConvoQueue, ...ownQueue];

        const shouldDrain = end.outcome === 'completed' || interruptArmed;
        const next = shouldDrain ? (merged[0] ?? null) : null;
        const remainder = next ? merged.slice(1) : merged;

        if (shouldMigrate && newConvoQueue.length > 0) {
          set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), []);
        }
        if (remainder.length !== ownQueue.length || shouldMigrate || next != null) {
          set(store.queuedMessagesByConvoId(conversationId), remainder);
        }
        return next ? { next, conversationId } : null;
      },
    [index, activeConversationId],
  );

  const restoreQueued = useRecoilCallback(
    ({ set }) =>
      (convoId: string, item: QueuedMessage) => {
        set(store.queuedMessagesByConvoId(convoId), (prev) =>
          prev.some((queued) => queued.id === item.id) ? prev : [item, ...prev],
        );
      },
    [],
  );

  useEffect(() => {
    if ((runEnd == null && parkedRunEnd == null) || isSubmitting) {
      return;
    }
    const drained = drainNext();
    if (drained == null) {
      return;
    }
    const { next, conversationId } = drained;
    // The queued item is the FULL submission context: explicit (possibly
    // empty) overrides stop `ask` from vacuuming up files, quotes, or skill
    // picks the user has staged in the composer for their NEXT message.
    const accepted = ask(
      { text: next.text },
      {
        overrideFiles: next.files ?? [],
        overrideQuotes: next.quotes ?? [],
        overrideManualSkills: next.manualSkills ?? [],
      },
    );
    if (accepted === false) {
      // `ask` refused without sending (e.g. the conversation history is not
      // in the query cache yet, right after navigating back). Restore the
      // item so the user's text is never silently dropped — the chip stays
      // available for manual send.
      restoreQueued(conversationId, next);
    }
  }, [runEnd, parkedRunEnd, isSubmitting, activeConversationId, drainNext, restoreQueued, ask]);
}
