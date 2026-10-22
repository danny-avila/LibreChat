/** Marks dispatch only after local preflight has succeeded. */
export function dispatchFileStorageOperation<T>(
  onStart: (() => void) | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  onStart?.();
  return operation();
}
