/**
 * Wraps a promise with a timeout. If the promise doesn't resolve/reject within
 * the specified time, it will be rejected with a timeout error.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param errorMessage - Custom error message for timeout (optional)
 * @param logger - Optional logger function to log timeout errors (e.g., console.warn, logger.warn)
 * @returns Promise that resolves/rejects with the original promise or times out
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'Failed to fetch data within 5 seconds',
 *   console.warn
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
  logger?: (message: string, error: Error) => void,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(errorMessage ?? `Operation timed out after ${timeoutMs}ms`);
      if (logger) logger(error.message, error);
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}
