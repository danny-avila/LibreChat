/** Upper clamp for the delta-coalescing window; larger values only add UI staleness. */
const MAX_COALESCE_WINDOW_MS = 1000;
/** Coalesced-batch safety caps: a full buffer flushes immediately, ahead of the window. */
export const MAX_COALESCED_EVENTS = 64;
export const MAX_COALESCED_BYTES = 128 * 1024;

/**
 * Streaming-delta coalescing window shared by the Redis transport (publish frames)
 * and the Redis job store (durable appends). Both sides MUST buffer on the same
 * window: the subscriber resume frontier assumes an event is never visible in the
 * durable chunk log meaningfully earlier than its sequence lands on the shared
 * counter, so batching one side without the other reopens that race for the full
 * window instead of a same-tick skew. 0 (the default) disables coalescing.
 */
export function resolveCoalesceWindowMs(configured?: number): number {
  const raw = configured ?? Number(process.env.STREAM_DELTA_COALESCE_MS ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.min(Math.floor(raw), MAX_COALESCE_WINDOW_MS);
}
