import { useRecoilCallback } from 'recoil';
import type { TPendingSteer } from 'librechat-data-provider';
import store from '~/store';

/**
 * Converts server-reported leftover steers into queued follow-up chips.
 * Converted ids join the applied set so a 202 ACK that lands after the run
 * ended drops its chip instead of re-minting a stranded `pending` one — the
 * set must survive run end for exactly that race, so it is capped, not
 * cleared. Safe to call from multiple delivery paths for the same steers
 * (final SSE event AND abort HTTP response): chip removal and queue
 * insertion both dedupe by steer id.
 */
export default function useSteerConvert() {
  return useRecoilCallback(
    ({ set }) =>
      (conversationId: string, steers: TPendingSteer[]) => {
        if (steers.length === 0) {
          return;
        }
        const steerIds = new Set(steers.map((steer) => steer.steerId));
        set(store.appliedSteerIdsByConvoId(conversationId), (prev) =>
          [
            ...prev,
            ...steers.map((steer) => steer.steerId).filter((id) => !prev.includes(id)),
          ].slice(-100),
        );
        set(store.pendingSteersByConvoId(conversationId), (prev) =>
          prev.filter((steer) => !steerIds.has(steer.steerId)),
        );
        set(store.queuedMessagesByConvoId(conversationId), (prev) => [
          ...prev,
          ...steers
            .filter((steer) => !prev.some((queued) => queued.id === steer.steerId))
            .map((steer) => ({
              id: steer.steerId,
              text: steer.text,
              createdAt: steer.createdAt ?? Date.now(),
              ...(steer.files && steer.files.length > 0 && { files: steer.files }),
            })),
        ]);
      },
    [],
  );
}
