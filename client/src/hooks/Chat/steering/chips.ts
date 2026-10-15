import { useCallback, useMemo } from 'react';
import { useStore } from 'jotai';
import { useRecoilCallback } from 'recoil';
import { isSteerRunReplaced, acknowledgeSteerChips } from '@librechat/chat';
import type { PendingSteer } from '@librechat/chat';
import type { CallbackInterface } from 'recoil';
import type { MutableRefObject } from 'react';
import { pendingQuotesByConvoId } from '~/components/Chat/Input/Composer/state';
import { appendAppliedSteerIds, mergeRestagedQuotes } from '~/utils';
import { pendingSteerCancelClientIdsFamily } from '~/store/steer';
import store from '~/store';

/**
 * Resolves a steer's 202 ACK against the applied-id set and the run's live
 * state: on the common path the local chip is swapped for its server-assigned
 * id (still `pending`, awaiting `on_steer_applied`). If an `on_steer_applied`
 * event already beat the ACK, if the source generation was replaced, or if the
 * run itself ended before the ACK landed, no later SSE event will ever resolve
 * a `pending` chip, so the caller is told to route the words into the queue
 * instead of stranding one.
 *
 * `ordinaryRunOver` is the caller's observation of ordinary terminal state
 * (the visible pane is idle); epoch replacement is derived here so every
 * caller applies the same rule.
 *
 * The single implementation for EVERY 202: the composer's own POST and an ACK
 * originating outside it (`useSteerRecovery`'s retry, for a steer that already
 * failed once) both resolve through this, instead of approximating each other.
 *
 * @returns true when the caller must route the steer into the queue.
 */
export function resolveAcknowledgedSteer(
  { snapshot, set }: Pick<CallbackInterface, 'snapshot' | 'set'>,
  conversationId: string,
  localId: string,
  steer: PendingSteer,
  ordinaryRunOver: boolean,
): boolean {
  const applied = snapshot.getLoadable(store.appliedSteerIdsByConvoId(conversationId)).getValue();
  const alreadyApplied = applied.includes(steer.steerId) || applied.includes(localId);
  const alreadyAccepted = snapshot
    .getLoadable(store.acceptedSteerClientIdsByConvoId(conversationId))
    .getValue()
    .includes(localId);
  const activeEpoch = snapshot
    .getLoadable(store.activeGenerationCreatedAtByConvoId(conversationId))
    .getValue();
  const runOver = ordinaryRunOver || isSteerRunReplaced(steer, activeEpoch);
  set(store.acceptedSteerClientIdsByConvoId(conversationId), (prev) =>
    appendAppliedSteerIds(prev, [localId]),
  );
  set(store.pendingSteersByConvoId(conversationId), (prev) =>
    acknowledgeSteerChips(prev, localId, steer, alreadyApplied || alreadyAccepted || runOver),
  );
  /** `alreadyAccepted` can come from the correlation update that precedes the
   * delayed HTTP response; it proves server ownership, not delivery. Once the
   * source epoch is over/replaced we still must recover it. */
  if (alreadyApplied || !runOver) {
    return false;
  }
  // The server accepted but this run is already terminal. Its terminal close
  // may have parked the item, so the caller must route it through the recovery
  // converter (deterministic next-turn id), not an ordinary editable queue row.
  return true;
}

/** The pending-steer chips of every conversation this composer has steered:
 *  optimistic writes, ACK and replay settlement, and the cancel markers a POST
 *  callback must honour. */
export default function useSteerChips({
  visibleConversationRef,
  isSubmittingRef,
}: {
  /** The conversation on screen now, read when a POST callback lands. */
  visibleConversationRef: MutableRefObject<string>;
  /** The visible pane's live submission state, read when a POST callback lands. */
  isSubmittingRef: MutableRefObject<boolean>;
}) {
  const jotaiStore = useStore();
  const upsertSteerChip = useRecoilCallback(
    ({ set }) =>
      (convoId: string, steer: PendingSteer) => {
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const existing = prev.findIndex((item) => item.steerId === steer.steerId);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = steer;
            return next;
          }
          return [...prev, steer];
        });
      },
    [],
  );

  const replaceSteerChip = useRecoilCallback(
    ({ set }) =>
      (convoId: string, localId: string, steer: PendingSteer | null) => {
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          const next = prev.filter((item) => item.steerId !== localId);
          return steer ? [...next, steer] : next;
        });
      },
    [],
  );

  /**
   * The composer's 202 ACK, resolved by the SHARED implementation so it cannot
   * drift from the one `useSteerRecovery` uses for a retry's ACK.
   *
   * All this call site contributes is its observation of ordinary terminal
   * state: this hook instance survives navigation, so the visible pane's idle
   * flag says nothing about an off-screen origin run, and terminal state may
   * only be inferred while the callback still belongs to the visible chat.
   * Epoch replacement is derived inside the resolver for every caller.
   */
  const acknowledgeSteer = useRecoilCallback(
    (cbInterface) =>
      (convoId: string, localId: string, steer: PendingSteer): boolean =>
        resolveAcknowledgedSteer(
          cbInterface,
          convoId,
          localId,
          steer,
          visibleConversationRef.current === convoId && !isSubmittingRef.current,
        ),
    [],
  );

  const settleReceiptReplay = useRecoilCallback(
    ({ set }) =>
      (convoId: string, localId: string, serverId: string) => {
        set(store.appliedSteerIdsByConvoId(convoId), (prev) =>
          appendAppliedSteerIds(prev, [localId, serverId]),
        );
        set(store.acceptedSteerClientIdsByConvoId(convoId), (prev) =>
          appendAppliedSteerIds(prev, [localId]),
        );
        set(store.pendingSteersByConvoId(convoId), (prev) =>
          prev.filter((steer) => steer.steerId !== localId && steer.steerId !== serverId),
        );
      },
    [],
  );

  /** Terminal/applied SSE can settle the optimistic client id before either
   * HTTP callback. Those callbacks must become no-ops or a lost response can
   * resurrect already-delivered words as a failed chip or queued fallback. */
  const isSteerAcceptedOrSettled = useRecoilCallback(
    ({ snapshot }) =>
      (convoId: string, clientSteerId: string) => {
        const applied = snapshot.getLoadable(store.appliedSteerIdsByConvoId(convoId)).getValue();
        if (applied.includes(clientSteerId)) {
          return true;
        }
        const accepted = snapshot
          .getLoadable(store.acceptedSteerClientIdsByConvoId(convoId))
          .getValue();
        if (accepted.includes(clientSteerId)) {
          return true;
        }
        return snapshot
          .getLoadable(store.pendingSteersByConvoId(convoId))
          .getValue()
          .some((steer) => steer.status === 'pending' && steer.clientSteerId === clientSteerId);
      },
    [],
  );
  const hasPendingSteerCancel = useCallback(
    (convoId: string, clientSteerId: string) =>
      jotaiStore.get(pendingSteerCancelClientIdsFamily(convoId)).includes(clientSteerId),
    [jotaiStore],
  );
  const clearPendingSteerCancel = useCallback(
    (convoId: string, clientSteerId: string) => {
      jotaiStore.set(pendingSteerCancelClientIdsFamily(convoId), (prev) =>
        prev.filter((id) => id !== clientSteerId),
      );
    },
    [jotaiStore],
  );

  /** Returns rejected excerpts to the composer chips from the SURVIVING steer
   *  chip, used ONLY for a settled receipt replay, where the steer already
   *  injected in the source generation and no future applied event or
   *  terminal conversion will ever re-home the chip's quotes. An ordinary
   *  no-echo ACK deliberately does NOT reclaim: its steer is still queued, so
   *  the quotes stay carried on the pending chip; the applied-event
   *  reconciliation re-stages them at the actual moment of loss, while a
   *  terminal leftover conversion moves them onto the recovered row, which
   *  sends via `ask` where quotes work on any server. When no chip remains,
   *  another path already owns the excerpts and re-staging would
   *  double-deliver. The chip is stripped in the same update (including its
   *  captured queue-origin copy) so the restaged composer chips stay their
   *  single representation. */
  const reclaimRejectedChipQuotes = useRecoilCallback(
    ({ snapshot, set }) =>
      (convoId: string, steerIds: string[]) => {
        const chips = snapshot.getLoadable(store.pendingSteersByConvoId(convoId)).getValue();
        const chip = chips.find((steer) => steerIds.includes(steer.steerId));
        const quotes = chip?.quotes ?? chip?.queuedOrigin?.item.quotes;
        if (quotes == null || quotes.length === 0) {
          return;
        }
        jotaiStore.set(pendingQuotesByConvoId(convoId), (prev) =>
          mergeRestagedQuotes(prev, quotes),
        );
        set(store.pendingSteersByConvoId(convoId), (prev) => {
          let changed = false;
          const next = prev.map((steer) => {
            const originHasQuotes = steer.queuedOrigin?.item.quotes != null;
            if (!steerIds.includes(steer.steerId) || (steer.quotes == null && !originHasQuotes)) {
              return steer;
            }
            changed = true;
            const { quotes: _quotes, ...rest } = steer;
            if (!originHasQuotes || rest.queuedOrigin == null) {
              return rest;
            }
            const { quotes: _originQuotes, ...originItem } = rest.queuedOrigin.item;
            return {
              ...rest,
              queuedOrigin: { ...rest.queuedOrigin, item: originItem },
            };
          });
          return changed ? next : prev;
        });
      },
    [jotaiStore],
  );

  return useMemo(
    () => ({
      upsertSteerChip,
      replaceSteerChip,
      acknowledgeSteer,
      settleReceiptReplay,
      isSteerAcceptedOrSettled,
      hasPendingSteerCancel,
      clearPendingSteerCancel,
      reclaimRejectedChipQuotes,
    }),
    [
      upsertSteerChip,
      replaceSteerChip,
      acknowledgeSteer,
      settleReceiptReplay,
      isSteerAcceptedOrSettled,
      hasPendingSteerCancel,
      clearPendingSteerCancel,
      reclaimRejectedChipQuotes,
    ],
  );
}

export type SteerChips = ReturnType<typeof useSteerChips>;
