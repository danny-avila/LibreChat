import { useEffect, useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { QueuedMessage } from '~/store/families';
import type { TAskFunction } from '~/common';
import { useMarkFilesUsageMutation } from '~/data-provider';
import store from '~/store';

/** Mirrors the server's per-request cap on a usage touch. */
const QUEUE_USAGE_MAX_FILES = 10;

/** Well under the server's smallest hold (24h), so no gap between renewals
 *  can outlive one, however long a run pauses. */
const QUEUE_USAGE_RENEW_INTERVAL_MS = 30 * 60 * 1000;

const collectQueuedFileIds = (items: QueuedMessage[]): string[] => {
  const fileIds: string[] = [];
  for (const item of items) {
    for (const file of item.files ?? []) {
      if (typeof file.file_id === 'string' && file.file_id.length > 0) {
        fileIds.push(file.file_id);
      }
    }
  }
  return fileIds;
};

/** The server caps ids per request, so a queue holding more than one batch
 *  has to renew in several. Truncating instead would leave everything after
 *  the first batch on its enqueue-time hold. */
const batchFileIds = (fileIds: string[]): string[][] => {
  const batches: string[][] = [];
  for (let i = 0; i < fileIds.length; i += QUEUE_USAGE_MAX_FILES) {
    batches.push(fileIds.slice(i, i + QUEUE_USAGE_MAX_FILES));
  }
  return batches;
};

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
  const { mutate: markFilesUsage } = useMarkFilesUsageMutation();
  const ownQueue = useRecoilValue(
    store.queuedMessagesByConvoId(activeConversationId ?? Constants.NEW_CONVO),
  );
  /** `drainNext` merges this in, and it outlives the URL update: items queued
   *  during the first turn stay keyed here until that run ends. Renewing only
   *  the active id would skip them for the whole of that run. */
  const newConvoQueue = useRecoilValue(store.queuedMessagesByConvoId(Constants.NEW_CONVO));

  /* Deduped because the two subscriptions are the same atom before migration.
   * Keyed by id list so the effect re-runs when the held set changes, not
   * whenever Recoil hands back a new array for the same contents. */
  const renewKey = [
    ...new Set([...collectQueuedFileIds(ownQueue), ...collectQueuedFileIds(newConvoQueue)]),
  ].join(',');
  const queuedFileIds = useMemo(() => (renewKey ? renewKey.split(',') : []), [renewKey]);

  /**
   * Heartbeat renewal while anything is queued.
   *
   * Renewing only at drain transitions ties an attachment's survival to
   * catching every state change, and a single run can stretch well past one
   * hold: it may interrupt for approval more than once, and each pause can
   * run to the configured window. Rather than hook every transition, renew on
   * a cadence far shorter than the hold itself, so no single gap can outlive
   * it. Bounded regardless: the server clamps each renewal against the file's
   * upload time. A queue nobody has open stops emitting these and lapses
   * normally.
   */
  useEffect(() => {
    if (queuedFileIds.length === 0) {
      return;
    }
    const renew = () => {
      for (const file_ids of batchFileIds(queuedFileIds)) {
        markFilesUsage({ file_ids });
      }
    };
    /* Immediately, not one interval later: returning to a conversation whose
     * hold is nearly up would otherwise wait out a full period first. */
    renew();
    const timer = setInterval(renew, QUEUE_USAGE_RENEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [queuedFileIds, markFilesUsage]);

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
      // item so the user's text is never silently dropped, the chip stays
      // available for manual send.
      restoreQueued(conversationId, next);
      /** Popping and restoring leaves the held set identical, so the renewal
       *  effect sees no change and will not re-run. Draining normally does
       *  change the set, and renews itself. Fire-and-forget: send-time
       *  marking is the backstop. */
      for (const file_ids of batchFileIds(collectQueuedFileIds([next]))) {
        markFilesUsage({ file_ids });
      }
    }
  }, [
    runEnd,
    parkedRunEnd,
    isSubmitting,
    activeConversationId,
    drainNext,
    restoreQueued,
    markFilesUsage,
    ask,
  ]);
}
