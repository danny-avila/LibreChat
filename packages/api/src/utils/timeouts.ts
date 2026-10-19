import type { AppConfig } from '@librechat/data-schemas';

/** Budgets for outbound calls made inside a request, used when `timeouts` omits a key. */
export const DEFAULT_OUTBOUND_TIMEOUTS_MS = {
  ragMs: 30_000,
  ocrMs: 300_000,
  actionsMs: 60_000,
  moderationMs: 10_000,
  imageFetchMs: 30_000,
  imageGenerationMs: 300_000,
} as const;

export type OutboundTimeout = keyof typeof DEFAULT_OUTBOUND_TIMEOUTS_MS;

/** The `librechat.yaml` `timeouts` value for `key`, else its default. */
export function getOutboundTimeoutMs(
  appConfig: Pick<AppConfig, 'timeouts'> | null | undefined,
  key: OutboundTimeout,
): number {
  return appConfig?.timeouts?.[key] ?? DEFAULT_OUTBOUND_TIMEOUTS_MS[key];
}

/**
 * A deadline shared by several calls: `expired()` turns true once the budget for `key` is
 * spent, and `remainingMs()` is the budget left for the next call (at least 1, since axios
 * reads 0 as no timeout).
 */
export interface OutboundDeadline {
  expired: () => boolean;
  remainingMs: () => number;
}

export function startOutboundDeadline(
  appConfig: Pick<AppConfig, 'timeouts'> | null | undefined,
  key: OutboundTimeout,
): OutboundDeadline {
  const deadline = Date.now() + getOutboundTimeoutMs(appConfig, key);
  return {
    expired: () => Date.now() >= deadline,
    remainingMs: () => Math.max(1, deadline - Date.now()),
  };
}

/**
 * Polls every `intervalMs` until `isSettled` accepts a result, giving each poll the budget left
 * on `deadline`. Resolves `undefined` once the deadline passes without a settled result; a
 * rejected poll rejects the whole wait.
 */
export async function pollUntilSettled<T>({
  deadline,
  intervalMs,
  poll,
  isSettled,
}: {
  deadline: OutboundDeadline;
  intervalMs: number;
  poll: (timeoutMs: number) => Promise<T>;
  isSettled: (result: T) => boolean;
}): Promise<T | undefined> {
  while (!deadline.expired()) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, deadline.remainingMs())),
    );
    const result = await poll(deadline.remainingMs());
    if (isSettled(result)) {
      return result;
    }
  }
  return undefined;
}
