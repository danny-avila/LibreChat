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
export default function useQueueDrain(index: string | number, ask: TAskFunction) {
  const runEnd = useRecoilValue(store.runEndByIndex(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));

  // Fully synchronous reads (getLoadable): a useRecoilCallback snapshot is
  // only guaranteed valid for the callback's synchronous execution, so no
  // awaits may interleave with the reads.
  const drainNext = useRecoilCallback(
    ({ snapshot, set }) =>
      (): QueuedMessage | null => {
        const end = snapshot.getLoadable(store.runEndByIndex(index)).getValue();
        if (end == null) {
          return null;
        }
        // Consume the signal first — a hard double-fire guard even if the
        // effect re-runs before Recoil propagates.
        set(store.runEndByIndex(index), null);

        const interruptArmed = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
        if (interruptArmed) {
          set(store.drainAfterAbortByIndex(index), false);
        }

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
        return next;
      },
    [index],
  );

  useEffect(() => {
    if (runEnd == null || isSubmitting) {
      return;
    }
    const next = drainNext();
    if (next == null) {
      return;
    }
    // The queued item is the FULL submission context: explicit (possibly
    // empty) overrides stop `ask` from vacuuming up files, quotes, or skill
    // picks the user has staged in the composer for their NEXT message.
    ask(
      { text: next.text },
      {
        overrideFiles: next.files ?? [],
        overrideQuotes: [],
        overrideManualSkills: [],
      },
    );
  }, [runEnd, isSubmitting, drainNext, ask]);
}
