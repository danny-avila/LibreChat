import type { AppConfig } from '@librechat/data-schemas';

/** Budgets for outbound calls made inside a request, used when `timeouts` omits a key. */
export const DEFAULT_OUTBOUND_TIMEOUTS_MS = {
  ragMs: 30_000,
  ocrMs: 300_000,
  actionsMs: 300_000,
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

/** The `name` of the error an outbound deadline aborts with, so it is never read as a user stop. */
export const OUTBOUND_TIMEOUT_ERROR = 'OutboundTimeoutError';

/** What an operator sees when a budget runs out: the key to raise and its current value. */
export function outboundTimeoutMessage(key: OutboundTimeout, timeoutMs: number): string {
  return `Exceeded timeouts.${key} (${timeoutMs} ms); raise it in librechat.yaml if this upstream is legitimately slow`;
}

/**
 * Axios options bounding one request by `timeoutMs`, both as socket idle time (`timeout`) and as
 * wall-clock time (the abort signal), since a response that keeps trickling bytes never goes idle.
 * Either way the request fails with `outboundTimeoutMessage`, and the deadline also follows
 * `signal` when given.
 */
export function outboundRequestBudget(
  timeoutMs: number,
  key: OutboundTimeout,
  signal?: AbortSignal,
): { timeout: number; timeoutErrorMessage: string; signal: AbortSignal } {
  const message = outboundTimeoutMessage(key, timeoutMs);
  const controller = new AbortController();
  const reason = Object.assign(new Error(message), { name: OUTBOUND_TIMEOUT_ERROR });
  setTimeout(() => controller.abort(reason), timeoutMs).unref();
  return {
    timeout: timeoutMs,
    timeoutErrorMessage: message,
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
  };
}

/** The budget overrun behind `error`, if it was one: an idle timeout or a passed deadline. */
export function getOutboundTimeout(error: unknown): Error | undefined {
  if (error == null || typeof error !== 'object') {
    return undefined;
  }
  const { message, config } = error as {
    message?: unknown;
    config?: { signal?: { reason?: unknown } };
  };
  const reason = config?.signal?.reason;
  if (reason instanceof Error && reason.name === OUTBOUND_TIMEOUT_ERROR) {
    return reason;
  }
  if (typeof message === 'string' && message.startsWith('Exceeded timeouts.')) {
    return error as Error;
  }
  return undefined;
}
