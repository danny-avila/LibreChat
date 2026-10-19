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
export function startOutboundDeadline(
  appConfig: Pick<AppConfig, 'timeouts'> | null | undefined,
  key: OutboundTimeout,
): { expired: () => boolean; remainingMs: () => number } {
  const deadline = Date.now() + getOutboundTimeoutMs(appConfig, key);
  return {
    expired: () => Date.now() >= deadline,
    remainingMs: () => Math.max(1, deadline - Date.now()),
  };
}
