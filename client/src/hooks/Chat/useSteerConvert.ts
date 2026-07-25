import { useCallback } from 'react';
import { useRecoilCallback } from 'recoil';
import type { TPendingSteer } from 'librechat-data-provider';
import type { QueuedMessage } from '~/store/families';
import type { SteerCarriedContext } from '~/utils';
import { appendAppliedSteerIds, carriedSteerContext } from '~/utils';
import { fetchStreamStatus } from '~/data-provider';
import store from '~/store';

/** A server-reported steer, or a local one that carries its own client-only
 *  context (quotes / skill picks) because its chip may already be gone. */
type ConvertibleSteer = TPendingSteer & SteerCarriedContext;

interface SteerConvertOptions {
  /** Live-delivered terminal steers also have a parked server copy (the
   *  terminal drain parks before knowing the final reached a subscriber);
   *  set on final/abort/error surfaces to claim-and-clear it. */
  claimParked?: boolean;
  /** Server-side id the parked copy is keyed under when it differs from the
   *  chip landing key (a `new`-held abort claims under the resolved job id). */
  claimConversationId?: string;
}

/**
 * Converts server-reported leftover steers into queued follow-up chips.
 * Converted ids join the applied set so a 202 ACK that lands after the run
 * ended drops its chip instead of re-minting a stranded `pending` one — the
 * set must survive run end for exactly that race, so it is capped, not
 * cleared. Safe to call from multiple delivery paths for the same steers
 * (final SSE event AND abort HTTP response): chip removal and queue
 * insertion both dedupe by steer id.
 *
 * `claimParked` fires ONE fire-and-forget /chat/status fetch per conversion
 * batch: its claim-on-read consumes the parked copy of steers just delivered
 * live, so a later reload cannot resurrect chips the user already dismissed.
 * Claimed steers re-run the same id-deduped conversion (no double-add).
 * Residual race: the claim no-ops if the job hasn't gone terminal by fetch
 * time — acceptable; the parked-copy TTL still bounds it.
 */
export default function useSteerConvert() {
  const convert = useRecoilCallback(
    ({ snapshot, set }) =>
      (conversationId: string, steers: ConvertibleSteer[]) => {
        if (steers.length === 0) {
          return;
        }
        // Quotes/skill picks never ride the server steer; restore them from
        // the local chip (matched by id) before the chips are dropped below.
        const localChips = snapshot
          .getLoadable(store.pendingSteersByConvoId(conversationId))
          .getValue();
        const chipById = new Map(localChips.map((chip) => [chip.steerId, chip]));
        const steerIds = new Set(steers.map((steer) => steer.steerId));
        // Steers already settled (applied on the server OR converted here on an
        // earlier delivery) must not re-enter the queue. Read BEFORE the append
        // below so a first-time conversion still queues, but a redelivery whose
        // item was already DRAINED out of the queue is a no-op — without this,
        // the queue-only dedup below misses a message the run-end drain already
        // submitted and re-mints it as a stranded queued chip.
        const settledSteerIds = new Set(
          snapshot.getLoadable(store.appliedSteerIdsByConvoId(conversationId)).getValue(),
        );
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          appendAppliedSteerIds(
            prev,
            steers.map((steer) => steer.steerId),
          ),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((steer) => !steerIds.has(steer.steerId)),
        );
        set(store.queuedMessagesByConvoId(conversationId), (prev) => {
          const fresh = steers
            .filter(
              (steer) =>
                !settledSteerIds.has(steer.steerId) &&
                !prev.some((queued) => queued.id === steer.steerId),
            )
            .map((steer) => ({
              id: steer.steerId,
              text: steer.text,
              createdAt: steer.createdAt ?? Date.now(),
              ...(steer.files && steer.files.length > 0 && { files: steer.files }),
              // The chip is the usual source, but a reclaimed steer may have
              // lost its chip to a competing cancel mid-round-trip — it carries
              // the context itself so the picks survive either way.
              ...carriedSteerContext(chipById.get(steer.steerId) ?? steer),
            }));
          if (fresh.length === 0) {
            return prev;
          }
          // Merge chronologically — a steer accepted BEFORE the user queued a
          // later follow-up must drain first — EXCEPT explicit front-inserts
          // ("Interrupt & send"), whose urgency outranks age.
          const merged: QueuedMessage[] = [...prev, ...fresh];
          return merged.sort(
            (a, b) =>
              Number(b.priority ?? false) - Number(a.priority ?? false) ||
              a.createdAt - b.createdAt,
          );
        });
      },
    [],
  );

  return useCallback(
    (conversationId: string, steers: ConvertibleSteer[], options?: SteerConvertOptions) => {
      convert(conversationId, steers);
      if (options?.claimParked !== true || steers.length === 0) {
        return;
      }
      fetchStreamStatus(options.claimConversationId ?? conversationId)
        .then((status) => {
          const unrecovered = status.unrecoveredSteers ?? [];
          if (unrecovered.length > 0) {
            convert(conversationId, unrecovered);
          }
        })
        .catch(() => undefined);
    },
    [convert],
  );
}
