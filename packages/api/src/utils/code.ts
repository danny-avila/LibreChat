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
  const body = error.response.data as { retry_after_seconds?: unknown } | undefined;
  const bodySeconds = Number(body?.retry_after_seconds);
  if (Number.isFinite(bodySeconds) && bodySeconds >= 0) {
    return bodySeconds * 1000;
  }
  return null;
}
