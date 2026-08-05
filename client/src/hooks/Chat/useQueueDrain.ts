import { useEffect, useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { DrainAfterAbort, QueuedMessage, QueuedMessageOrigin, RunEnd } from '~/store/families';
import type { TAskFunction } from '~/common';
import { compareQueuedMessages, isSameRunEpoch, isSendableQueuedMessage } from '~/utils';
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

/** Gmail-style window to take an automatic send back before it fires. */
export const QUEUE_UNDO_GRACE_MS = 3000;

/** Interrupt intent belongs to one generation, never to whichever terminal
 * event happens to occupy the shared pane slot next. The NEW_CONVO alias is
 * the one exception: after its first successful start, the terminal event
 * carries the resolved conversation id while migrating the NEW_CONVO queue. */
const matchesInterruptArm = (armed: DrainAfterAbort | false, end: RunEnd): boolean => {
  if (armed === false || end.generationCreatedAt == null) {
    return false;
  }
  const sameConversation =
    armed.conversationId === end.conversationId ||
    (end.startedAsNewConvo === true && armed.conversationId === String(Constants.NEW_CONVO));
  return sameConversation && armed.generationCreatedAt === end.generationCreatedAt;
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
 * - Withholds an automatic send for `undoGraceMs`: the terminal epoch is
 *   parked in `queueDrainHoldByConvoId` and re-posted when the window closes.
 *   The queue itself is untouched while a hold stands, so "undo" is a pure
 *   cancel — nothing to restore, nothing to lose. Manual sends and armed
 *   interrupts skip the grace: both are the user asking for it NOW.
 */
export default function useQueueDrain(
  index: string | number,
  activeConversationId: string | undefined,
  ask: TAskFunction,
  options?: { undoGraceMs?: number },
) {
  const undoGraceMs = options?.undoGraceMs ?? QUEUE_UNDO_GRACE_MS;
  const runEnd = useRecoilValue(store.runEndByIndex(index));
  const parkedRunEnd = useRecoilValue(
    store.pendingRunEndByConvoId(activeConversationId ?? Constants.NEW_CONVO),
  );
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const drainHold = useRecoilValue(
    store.queueDrainHoldByConvoId(activeConversationId ?? Constants.NEW_CONVO),
  );
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

  /** Move a foreign pane signal to its conversation before the submission
   * gate. A different conversation can already be submitting on this pane;
   * waiting for it to become idle lets its own terminal signal replace the
   * first one. Matching interrupt intent travels with the exact terminal
   * epoch, while unrelated intent remains armed for its owner. */
  const parkForeignRunEnd = useRecoilCallback(
    ({ snapshot, set }) =>
      (): boolean => {
        const end = snapshot.getLoadable(store.runEndByIndex(index)).getValue();
        if (
          end == null ||
          end.conversationId == null ||
          end.conversationId === activeConversationId
        ) {
          return false;
        }
        const armed = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
        const interruptArmed = matchesInterruptArm(armed, end);
        if (interruptArmed) {
          set(store.drainAfterAbortByIndex(index), false);
        }
        set(store.pendingRunEndByConvoId(end.conversationId), {
          ...end,
          ...((end.interruptArmed === true || interruptArmed) && { interruptArmed: true }),
        });
        set(store.runEndByIndex(index), null);
        return true;
      },
    [index, activeConversationId],
  );

  // Fully synchronous reads (getLoadable): a useRecoilCallback snapshot is
  // only guaranteed valid for the callback's synchronous execution, so no
  // awaits may interleave with the reads.
  const drainNext = useRecoilCallback(
    ({ snapshot, set }) =>
      (): {
        next: QueuedMessage;
        conversationId: string;
        queuedMessageOrigin: QueuedMessageOrigin;
        expectedPredecessorCreatedAt?: number;
      } | null => {
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
          const interruptArmed = matchesInterruptArm(armedNow, end);
          if (interruptArmed) {
            set(store.drainAfterAbortByIndex(index), false);
          }
          set(store.pendingRunEndByConvoId(end.conversationId), {
            ...end,
            ...((end.interruptArmed === true || interruptArmed) && { interruptArmed: true }),
          });
          set(store.runEndByIndex(index), null);
          return null;
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
        /** A standing window short-circuits BEFORE anything is consumed or
         *  written: both signal carriers retain unconsumed epochs, so leaving
         *  this one in place is lossless — and mutating nothing is what keeps
         *  the effect from re-running itself into a loop while it waits.
         *
         *  An armed interrupt is exempt. The user aborted a run to say this
         *  now, and the standing window may belong to an unrelated earlier
         *  epoch; making it wait out that timer contradicts the rule that
         *  armed interrupts skip the grace. Read-only, so the no-loop
         *  guarantee holds — the arm is consumed on the normal path below. */
        if (end.conversationId != null) {
          const standing = snapshot
            .getLoadable(store.queueDrainHoldByConvoId(end.conversationId))
            .getValue();
          const armedNow = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
          const interruptWaiting =
            matchesInterruptArm(armedNow, end) || end.interruptArmed === true;
          if (standing != null && standing.dueAt > Date.now() && !interruptWaiting) {
            return null;
          }
        }
        // Consume the signal first — a hard double-fire guard even if the
        // effect re-runs before Recoil propagates.
        if (fromParked && activeConversationId) {
          set(store.pendingRunEndByConvoId(activeConversationId), null);
        } else {
          set(store.runEndByIndex(index), null);
        }

        const indexArmed = snapshot.getLoadable(store.drainAfterAbortByIndex(index)).getValue();
        const matchingIndexArm = matchesInterruptArm(indexArmed, end);
        if (matchingIndexArm) {
          set(store.drainAfterAbortByIndex(index), false);
        }
        const interruptArmed = matchingIndexArm || end.interruptArmed === true;

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
        /** Both queues are ordered independently, but migration crosses the
         * key boundary: an interrupt queued under the resolved conversation
         * must still outrank an ordinary follow-up captured under NEW_CONVO. */
        const merged = shouldMigrate
          ? [...newConvoQueue, ...ownQueue].sort(compareQueuedMessages)
          : ownQueue;

        const shouldDrain = end.outcome === 'completed' || interruptArmed;
        const hold = snapshot.getLoadable(store.queueDrainHoldByConvoId(conversationId)).getValue();
        const now = Date.now();
        /** A hold owns exactly ONE epoch. A newer terminal event can be the one
         *  consumed above, and retiring the hold (or discarding that event) on
         *  its behalf would lose the newer signal and leave the older one to
         *  reopen a window — so act only on the epoch the hold actually holds. */
        const holdOwnsEnd = hold != null && isSameRunEpoch(hold.runEnd, end);
        if (holdOwnsEnd) {
          set(store.queueDrainHoldByConvoId(conversationId), null);
        }
        /** Undo landed after the timer handed this epoch back. The epoch is
         *  consumed above, so discarding it here is what makes the visible
         *  Undo mean what it says. */
        if (holdOwnsEnd && hold?.status === 'cancelled') {
          return null;
        }
        /** Withhold the epoch, never the queue: the rows stay exactly where
         *  they are, so cancelling is a no-op and a reload costs no text.
         *  A first turn's queue does have to migrate before the window opens —
         *  the composer reads the resolved id by then, so leaving the rows
         *  under `NEW_CONVO` would blank the group for the whole window. */
        if (
          shouldDrain &&
          !interruptArmed &&
          hold == null &&
          undoGraceMs > 0 &&
          merged.length > 0
        ) {
          if (shouldMigrate && newConvoQueue.length > 0) {
            set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), []);
            set(store.queuedMessagesByConvoId(conversationId), merged);
          }
          set(store.queueDrainHoldByConvoId(conversationId), {
            runEnd: end,
            dueAt: now + undoGraceMs,
          });
          return null;
        }
        /** A row mid-edit can be blank, and blank is not a message. Skipping to
         *  the row behind it would send out of order, so this epoch simply
         *  drains nothing — consumed above, so the effect cannot spin — and the
         *  next run end picks the queue up again. */
        const front = merged[0] ?? null;
        const next = shouldDrain && front != null && isSendableQueuedMessage(front) ? front : null;
        const remainder = next ? merged.slice(1) : merged;

        if (shouldMigrate && newConvoQueue.length > 0) {
          set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), []);
        }
        if (remainder.length !== ownQueue.length || shouldMigrate || next != null) {
          set(store.queuedMessagesByConvoId(conversationId), remainder);
        }
        return next
          ? {
              next,
              conversationId,
              queuedMessageOrigin: {
                item: next,
                beforeIds: [],
                afterIds: remainder.map((item) => item.id),
              },
              expectedPredecessorCreatedAt:
                end.generationCreatedAt ?? next.expectedPredecessorCreatedAt,
            }
          : null;
      },
    [index, activeConversationId],
  );

  /** Hands the held epoch back to the drain through the same parked slot a
   *  returning navigation uses, so an expired window resumes identically
   *  whether or not the user stayed on the conversation. */
  const releaseDrainHold = useRecoilCallback(
    ({ snapshot, set }) =>
      (convoId: string) => {
        const held = snapshot.getLoadable(store.queueDrainHoldByConvoId(convoId)).getValue();
        if (held == null || held.status != null) {
          return;
        }
        /** Marked before the epoch goes back so Undo stops being offered the
         *  moment the window closes — a new run can block the drain, and an
         *  Undo that no longer undoes anything is worse than none. */
        set(store.queueDrainHoldByConvoId(convoId), { ...held, status: 'released' });
        set(store.pendingRunEndByConvoId(convoId), held.runEnd);
      },
    [],
  );

  useEffect(() => {
    if (drainHold == null || drainHold.status != null) {
      return;
    }
    const convoId = activeConversationId ?? Constants.NEW_CONVO;
    const remaining = drainHold.dueAt - Date.now();
    if (remaining <= 0) {
      releaseDrainHold(convoId);
      return;
    }
    const timer = setTimeout(() => releaseDrainHold(convoId), remaining);
    return () => clearTimeout(timer);
  }, [drainHold, activeConversationId, releaseDrainHold]);

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
    if (
      runEnd != null &&
      runEnd.conversationId != null &&
      runEnd.conversationId !== activeConversationId
    ) {
      parkForeignRunEnd();
      return;
    }
    if ((runEnd == null && parkedRunEnd == null) || isSubmitting) {
      return;
    }
    const drained = drainNext();
    if (drained == null) {
      return;
    }
    const { next, conversationId, queuedMessageOrigin, expectedPredecessorCreatedAt } = drained;
    // The queued item is the FULL submission context: explicit (possibly
    // empty) overrides stop `ask` from vacuuming up files, quotes, or skill
    // picks the user has staged in the composer for their NEXT message.
    const accepted = ask(
      {
        text: next.text,
        // Recovery can fail after the user-row save but before the parked
        // source commit. Every attempt upserts the same source-derived row
        // while its generation idempotency key rotates independently.
        ...(next.recoverySteerId != null && {
          overrideUserMessageId: next.recoverySteerId,
        }),
      },
      {
        overrideFiles: next.files ?? [],
        overrideQuotes: next.quotes ?? [],
        overrideManualSkills: next.manualSkills ?? [],
        overrideClientRequestId: next.clientRequestId,
        overrideRecoverySteerId: next.recoverySteerId,
        overrideExpectedPredecessorCreatedAt: expectedPredecessorCreatedAt,
        overrideQueuedMessageOrigin: queuedMessageOrigin,
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
    /** A standing window leaves later epochs untouched, so removing it has to
     *  bring the drain back to reconsider them — otherwise a follow-up sits
     *  stranded until some unrelated dependency happens to change. */
    drainHold,
    isSubmitting,
    activeConversationId,
    parkForeignRunEnd,
    drainNext,
    restoreQueued,
    markFilesUsage,
    ask,
  ]);
}
