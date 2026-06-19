import { logger } from '@librechat/data-schemas';

const DEFAULT_TIMEOUT_MS = 15000;

export type TarsQuery = Record<string, string | number | boolean | undefined | null>;

export interface TarsFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: TarsQuery;
  timeoutMs?: number;
  baseUrl?: string;
}

/** Whether the pwc_tars integration is configured (env `TARS_AUTH_URL` is set). */
export function isTarsConfigured(baseUrl: string | undefined = process.env.TARS_AUTH_URL): boolean {
  return !!baseUrl?.trim();
}

/** Returns the trailing-slash-normalized pwc_tars base URL or throws when unconfigured. */
export function getTarsBaseUrl(baseUrl: string | undefined = process.env.TARS_AUTH_URL): string {
  if (!baseUrl?.trim()) {
    throw new Error('TARS_AUTH_URL is not configured');
  }
  return baseUrl.replace(/\/+$/, '');
}

function buildUrl(base: string, path: string, query?: TarsQuery): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!query) {
    return `${base}${normalizedPath}`;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null) {
      params.append(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `${base}${normalizedPath}?${queryString}` : `${base}${normalizedPath}`;
}

/**
 * Shared JSON fetch helper for pwc_tars Flask endpoints. Mirrors the timeout /
 * logging behavior of `auth/tars.ts` so every pwc_tars integration calls the
 * backend the same way. Throws on connection/timeout failures and on non-2xx
 * responses so callers can surface a 5xx.
 */
export async function tarsFetch<T>(path: string, options: TarsFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl } = options;
  const url = buildUrl(getTarsBaseUrl(baseUrl), path, query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.error(`[tarsFetch] Unexpected status ${response.status} from ${method} ${url}`);
      throw new Error(`pwc_tars request to ${path} returned status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error(`[tarsFetch] Request to ${url} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
