import http from 'http';
import https from 'https';
import { isAxiosError } from 'axios';

/**
 * Dedicated agents for code-server requests, preventing socket pool contamination.
 * follow-redirects (used by axios) leaks `socket.destroy` as a timeout listener;
 * on Node 19+ (keepAlive: true by default), tainted sockets re-enter the global pool
 * and kill unrelated requests (e.g., node-fetch in CodeExecutor) after the idle timeout.
 */
export const codeServerHttpAgent: http.Agent = new http.Agent({ keepAlive: false });
export const codeServerHttpsAgent: https.Agent = new https.Agent({ keepAlive: false });

/**
 * Wait implied by a Code API 429, in milliseconds, or `null` when the error
 * is not a rate-limit response. The service answers with both the standard
 * `Retry-After` header and a `retry_after_seconds` body field; the header is
 * preferred so a body the caller asked for as a stream/buffer never has to be
 * parsed, and the body is the fallback for proxies that drop the header.
 */
export function getCodeApiRetryAfterMs(error: unknown): number | null {
  if (!isAxiosError(error) || error.response?.status !== 429) {
    return null;
  }
  const header = error.response.headers?.['retry-after'];
  const raw = Array.isArray(header) ? header[0] : header;
  /* `Number('')` is 0, which would read as "retry immediately" and skip the
   * body fallback; treat a blank header as absent. */
  const headerSeconds = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
  if (Number.isFinite(headerSeconds) && headerSeconds >= 0) {
    return headerSeconds * 1000;
  }
  const body = error.response.data;
  if (typeof body === 'object' && body !== null && 'retry_after_seconds' in body) {
    const bodySeconds = Number(body.retry_after_seconds);
    if (Number.isFinite(bodySeconds) && bodySeconds >= 0) {
      return bodySeconds * 1000;
    }
  }
  return null;
}

/** Total time one operation may spend waiting out Code API rate limits.
 *  Sized to cover a single limiter window without stalling a chat turn. */
export const MAX_CODE_API_RATE_LIMIT_WAIT_MS = 20_000;

/** Remaining wait allowance, shared by every request of one operation. */
export interface CodeApiRateLimitBudget {
  remainingMs: number;
}

export function createCodeApiRateLimitBudget(
  totalMs: number = MAX_CODE_API_RATE_LIMIT_WAIT_MS,
): CodeApiRateLimitBudget {
  return { remainingMs: totalMs };
}

/**
 * Runs a Code API request, waiting out a rate limit whenever the shared
 * budget still covers the server's `Retry-After`. Multi-request operations
 * (a windowed image read, a batch upload) would otherwise abandon the work
 * already done the moment a limiter window closes mid-flight. A 429 the
 * budget cannot absorb throws a named error rather than a bare
 * "status code 429", which reads as an unspecified failure instead of one
 * that clears on its own.
 */
export async function withCodeApiRateLimit<T>(params: {
  attempt: () => Promise<T>;
  label: string;
  budget?: CodeApiRateLimitBudget;
  onWait?: (waitMs: number) => void;
}): Promise<T> {
  const { attempt, label, budget, onWait } = params;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (!isAxiosError(error) || error.response?.status !== 429) {
        throw error;
      }
      const retryAfterMs = getCodeApiRetryAfterMs(error);
      if (retryAfterMs == null) {
        throw new Error(`Code API rate limit reached while ${label}.`);
      }
      /* A zero delay would spin; charge at least a second so the budget
       * always drains and the loop terminates. */
      const waitMs = Math.max(retryAfterMs, 1000);
      if (budget == null || waitMs > budget.remainingMs) {
        throw new Error(
          `Code API rate limit reached while ${label} (retry in ${Math.ceil(waitMs / 1000)}s).`,
        );
      }
      budget.remainingMs -= waitMs;
      onWait?.(waitMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
