import { useCallback, useRef } from 'react';
import { request } from 'librechat-data-provider';

/**
 * Triggers a backend pre-warm of the user's Anthropic Skills container so
 * the first real Skills-enabled request doesn't pay the full cold-start.
 *
 * Wired to the Help Others entry points only:
 *   - StudentButton click (start a new Help Others conversation)
 *   - Loading an existing Help Others conversation from the sidebar
 *
 * Fire-and-forget: callers do not await. The hook deduplicates identical
 * back-to-back calls (e.g. button click + sidebar nav firing simultaneously)
 * within a short window so we don't spam the backend.
 */
export default function useWarmupSkillsContainer() {
  const lastFiredAtRef = useRef<number>(0);
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  const warmup = useCallback(() => {
    /* Frontend-side dedupe: ignore calls within 1s of the last fire. The
     * backend also dedupes (cache check + in-flight mutex) so this is a
     * belt-and-suspenders against accidental spam. */
    const now = Date.now();
    if (inFlightRef.current) {
      return inFlightRef.current;
    }
    if (now - lastFiredAtRef.current < 1000) {
      return null;
    }
    lastFiredAtRef.current = now;

    const promise = request
      .post('/api/anthropic/warmup', {})
      .catch(() => {
        /* Pre-warm failure is non-fatal; the next message will provision a
         * container itself. Swallow so we don't surface a toast for a
         * background optimization. */
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = promise;
    return promise;
  }, []);

  return warmup;
}
