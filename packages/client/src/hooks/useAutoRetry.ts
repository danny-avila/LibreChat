import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A failure right after a view opens is usually a blip — a sleeping laptop, a
 * dropped tunnel, a restarting proxy — so the first attempts come fast and then
 * back off. The sequence is bounded on purpose: once it runs out the caller can
 * offer a reload instead of polling forever in a background tab.
 */
export const DEFAULT_AUTO_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000] as const;

export interface UseAutoRetryOptions {
  /** False for failures a repeated request cannot fix (404s, validation errors). */
  enabled: boolean;
  /** True while the caller's request is in flight, which pauses the backoff. */
  isRetrying: boolean;
  onRetry?: () => void;
  /** Backoff steps in milliseconds; the count also bounds the attempts. */
  delaysMs?: readonly number[];
}

export interface AutoRetryState {
  /** Whole seconds until the next automatic attempt, or null while none is scheduled. */
  countdown: number | null;
  /** Every backoff step has been spent; nothing further happens automatically. */
  isExhausted: boolean;
  /** Retries now and restarts the backoff — wire this to the caller's action. */
  retryManually: () => void;
}

/**
 * Drives recovery for a visible failure: a bounded backoff plus an immediate
 * attempt when the browser regains connectivity or the tab is looked at again.
 * Without it an error state is terminal until the user clicks, which turns a
 * five-second network drop into a view that looks permanently broken.
 *
 * The caller keeps ownership of the request: this hook only decides *when* to
 * ask, and reports what to show while waiting.
 */
export default function useAutoRetry({
  enabled,
  isRetrying,
  onRetry,
  delaysMs = DEFAULT_AUTO_RETRY_DELAYS_MS,
}: UseAutoRetryOptions): AutoRetryState {
  const [attempt, setAttempt] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Kept in refs so the listeners below survive a new `onRetry` identity. */
  const onRetryRef = useRef(onRetry);
  const isRetryingRef = useRef(isRetrying);

  useEffect(() => {
    onRetryRef.current = onRetry;
    isRetryingRef.current = isRetrying;
  }, [onRetry, isRetrying]);

  const retryNow = useCallback(() => {
    setCountdown(null);
    onRetryRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled || isRetrying || attempt >= delaysMs.length) {
      setCountdown(null);
      return;
    }

    const delay = delaysMs[attempt];
    let remaining = Math.round(delay / 1000);
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining > 0 ? remaining : null);
    }, 1000);
    const timeout = setTimeout(() => {
      setAttempt((value) => value + 1);
      retryNow();
    }, delay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [enabled, isRetrying, attempt, delaysMs, retryNow]);

  /**
   * Connectivity returning is the strongest signal available, so it resets the
   * backoff and fires at once instead of waiting out the current delay. Focus
   * counts too: a request that failed while the tab was hidden would otherwise
   * sit on a stale error, since browsers throttle background timers.
   */
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const recover = () => {
      setAttempt(0);
      if (!isRetryingRef.current) {
        retryNow();
      }
    };
    const recoverWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        recover();
      }
    };

    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recoverWhenVisible);
    return () => {
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recoverWhenVisible);
    };
  }, [enabled, retryNow]);

  const retryManually = useCallback(() => {
    setAttempt(0);
    retryNow();
  }, [retryNow]);

  return {
    countdown,
    isExhausted: enabled && attempt >= delaysMs.length,
    retryManually,
  };
}
