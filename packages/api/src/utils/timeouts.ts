import type { AppConfig } from '@librechat/data-schemas';

/** Budgets for outbound calls made inside a request, used when `timeouts` omits a key. */
export const DEFAULT_OUTBOUND_TIMEOUTS_MS = {
  ragMs: 30_000,
  ocrMs: 300_000,
  actionsMs: 60_000,
  moderationMs: 10_000,
  imageFetchMs: 30_000,
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
 * Axios options bounding one request by `timeoutMs` of wall-clock time. Axios's own `timeout`
 * only fires on an idle socket, so a response that keeps trickling bytes would never end;
 * the abort signal caps the whole exchange and also follows `signal` when given.
 */
export function outboundRequestBudget(
  timeoutMs: number,
  signal?: AbortSignal,
): { timeout: number; signal: AbortSignal } {
  const deadline = AbortSignal.timeout(timeoutMs);
  return { timeout: timeoutMs, signal: signal ? AbortSignal.any([signal, deadline]) : deadline };
}
