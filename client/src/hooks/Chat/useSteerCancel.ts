import { useCallback } from 'react';
import { useRecoilCallback, useRecoilValue } from 'recoil';
import type { PendingSteer } from '~/store/families';
import { useCancelSteerMutation } from '~/data-provider';
import { appendAppliedSteerIds } from '~/utils';
import store from '~/store';

/**
 * `reclaimed` — the cancel beat the boundary; the words never entered the run.
 * `applied` — the steer already injected (or the run ended): the events own it.
 * `failed` — the POST failed, so the entry is restored and the server may still
 * inject it.
 */
export type SteerCancelOutcome = 'reclaimed' | 'applied' | 'failed';

/**
 * Asks the server to drop a steer before its injection boundary, touching no
 * chip state — the caller owns what happens to the words.
 *
 * A steer leaves the server queue only by injecting, so only `reclaimed` proves
 * the words never entered the run and are still the client's to re-home. Giving
 * an `applied` steer a second life (queueing it, editing it back into the
 * composer) would say the same thing twice; on `failed` the server may still
 * inject it, so its fate is unknown and it must be left alone.
 */
export function useSteerReclaim(conversationId: string) {
  const cancelMutation = useCancelSteerMutation();
  const activeGenerationCreatedAt = useRecoilValue(
    store.activeGenerationCreatedAtByConvoId(conversationId),
  );
  /** A confirmed reclaim is a terminal settlement too. Tombstone both ids so
   * a final payload captured before the server discard cannot requeue it, and
   * remove a recovered queue copy if the opposite ordering already occurred. */
  const settleReclaimed = useRecoilCallback(
    ({ set }) =>
      (steer: PendingSteer) => {
        const ids = [steer.steerId, ...(steer.clientSteerId ? [steer.clientSteerId] : [])];
        const settled = new Set(ids);
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          appendAppliedSteerIds(prev, ids),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter(
            (item) =>
              !settled.has(item.steerId) &&
              (item.clientSteerId == null || !settled.has(item.clientSteerId)),
          ),
        );
        set(store.queuedMessagesByConvoId(conversationId), (prev) =>
          prev.filter(
            (item) =>
              !settled.has(item.id) &&
              (item.recoverySteerId == null || !settled.has(item.recoverySteerId)) &&
              (item.recoveryClientSteerId == null || !settled.has(item.recoveryClientSteerId)),
          ),
        );
      },
    [conversationId],
  );

  return useCallback(
    async (steer: PendingSteer): Promise<SteerCancelOutcome> => {
      try {
        const generationCreatedAt =
          steer.generationCreatedAt ?? activeGenerationCreatedAt ?? undefined;
        if (generationCreatedAt == null) {
          return 'failed';
        }
        const { removed } = await cancelMutation.mutateAsync({
          conversationId,
          steerId: steer.steerId,
          ...(steer.clientSteerId && { clientSteerId: steer.clientSteerId }),
          generationCreatedAt,
        });
        if (removed === true) {
          settleReclaimed(steer);
          return 'reclaimed';
        }
        return 'applied';
      } catch {
        return 'failed';
      }
    },
    [conversationId, cancelMutation, settleReclaimed, activeGenerationCreatedAt],
  );
}

/**
 * Cancels a steer still waiting on its injection boundary. The chip stays
 * visible until the request settles so capability/update events can still
 * patch its current server revision while cancel is in flight. Only a
 * confirmed reclaim removes it here. `removed:false` is ambiguous in the v1
 * protocol (already injected OR terminal conversion won), so the event path
 * must decide whether to remove or recover that entry without discarding its
 * client-only files/quotes/skills first.
 */
export default function useSteerCancel(conversationId: string) {
  const reclaim = useSteerReclaim(conversationId);

  const removeEntry = useRecoilCallback(
    ({ set }) =>
      (steerId: string) => {
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((item) => item.steerId !== steerId),
        );
      },
    [conversationId],
  );
  return useCallback(
    async (steer: PendingSteer): Promise<SteerCancelOutcome> => {
      const outcome = await reclaim(steer);
      if (outcome === 'reclaimed') {
        removeEntry(steer.steerId);
      }
      return outcome;
    },
    [reclaim, removeEntry],
  );
}
