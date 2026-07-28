export const TERMINAL_RETRY_DELAYS = [1000, 2000, 5000, 10000, 20000, 30000] as const;
export const TERMINAL_RETRY_MAX_ATTEMPTS = 9;
export const TERMINAL_RETRY_MAX_ELAPSED_MS = 180000;

export type TerminalRetryStatus = 'succeeded' | 'aborted' | 'failed' | 'exhausted';

export type TerminalRetryResult<T> =
  | { status: 'succeeded'; value: T; attempts: number }
  | { status: 'aborted'; value?: T; attempts: number }
  | { status: 'failed'; value?: T; error?: unknown; attempts: number }
  | { status: 'exhausted'; value?: T; error?: unknown; attempts: number };

type TerminalRetryOptions<T> = {
  operation: () => Promise<T>;
  isSuccess?: (value: T) => boolean;
  shouldRetryError?: (error: unknown) => boolean;
  canContinue?: () => boolean;
  signal: AbortSignal;
  delays?: readonly number[];
  maxAttempts?: number;
  maxElapsedMs?: number;
  random?: () => number;
  now?: () => number;
  wait?: (delay: number, signal: AbortSignal) => Promise<boolean>;
};

export const waitForRetryDelay = (delay: number, signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    function cleanup() {
      signal.removeEventListener('abort', onAbort);
    }
    function onAbort() {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, delay);

    signal.addEventListener('abort', onAbort, { once: true });
  });

export function isRetryableTerminalError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return true;
  }

  const candidate = error as {
    status?: number;
    response?: { status?: number };
  };
  const status = candidate.response?.status ?? candidate.status;
  return status == null || status === 408 || status === 429 || status >= 500;
}

export function getJitteredRetryDelay(delay: number, random = Math.random): number {
  const normalizedRandom = Math.min(1, Math.max(0, random()));
  return Math.round(delay * (0.8 + normalizedRandom * 0.4));
}

export async function runTerminalRetry<T>({
  operation,
  isSuccess = () => true,
  shouldRetryError = isRetryableTerminalError,
  canContinue = () => true,
  signal,
  delays = TERMINAL_RETRY_DELAYS,
  maxAttempts = TERMINAL_RETRY_MAX_ATTEMPTS,
  maxElapsedMs = TERMINAL_RETRY_MAX_ELAPSED_MS,
  random = Math.random,
  now = Date.now,
  wait = waitForRetryDelay,
}: TerminalRetryOptions<T>): Promise<TerminalRetryResult<T>> {
  const startedAt = now();
  let latestValue: T | undefined;
  let latestError: unknown;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted || !canContinue()) {
      return { status: 'aborted', value: latestValue, attempts };
    }
    attempts = attempt;

    try {
      latestValue = await operation();
      latestError = undefined;
      if (isSuccess(latestValue)) {
        return { status: 'succeeded', value: latestValue, attempts: attempt };
      }
    } catch (error) {
      latestError = error;
      if (!shouldRetryError(error)) {
        return { status: 'failed', error, value: latestValue, attempts: attempt };
      }
    }

    if (attempt === maxAttempts) {
      break;
    }
    if (signal.aborted || !canContinue()) {
      return { status: 'aborted', value: latestValue, attempts };
    }

    const baseDelay = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
    const retryDelay = getJitteredRetryDelay(baseDelay, random);
    if (now() - startedAt + retryDelay > maxElapsedMs) {
      break;
    }
    if (!(await wait(retryDelay, signal))) {
      return { status: 'aborted', value: latestValue, attempts };
    }
  }

  return {
    status: 'exhausted',
    value: latestValue,
    error: latestError,
    attempts,
  };
}
