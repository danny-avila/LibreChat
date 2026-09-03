export interface SafeErrorMetadata {
  readonly type: string;
  readonly status?: number;
}

function readProperty(value: object, property: string): unknown {
  try {
    return (value as Record<string, unknown>)[property];
  } catch {
    return undefined;
  }
}

/**
 * Returns bounded diagnostic metadata without error messages, stacks, headers,
 * request bodies, or provider response data that may echo submitted content.
 */
export function getSafeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (error == null || typeof error !== 'object') {
    return { type: 'UnknownError' };
  }

  const directStatus = readProperty(error, 'status') ?? readProperty(error, 'statusCode');
  const response = readProperty(error, 'response');
  const responseStatus =
    response != null && typeof response === 'object' ? readProperty(response, 'status') : undefined;
  const statusCandidate = directStatus ?? responseStatus;
  const status =
    typeof statusCandidate === 'number' &&
    Number.isInteger(statusCandidate) &&
    statusCandidate >= 100 &&
    statusCandidate <= 599
      ? statusCandidate
      : undefined;

  return {
    type: error instanceof Error ? 'Error' : 'UnknownError',
    ...(status !== undefined && { status }),
  };
}

/**
 * Whether a caught error is a cancellation rather than a genuine failure.
 *
 * An aborted signal on its own proves only that the run is over: a permission,
 * OAuth, or upstream error can reject in the same tick a user presses Stop, and
 * treating those as cancellations hides real faults from operational alerts.
 * Callers that want to quiet a cancellation should require this as well as the
 * signal state. Walks `cause` because intermediate layers rewrap the rejection.
 */
export function isAbortError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current != null && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);

    const name = readProperty(current, 'name');
    const code = readProperty(current, 'code');
    const messageValue = readProperty(current, 'message');
    const message = typeof messageValue === 'string' ? messageValue : '';

    if (
      name === 'AbortError' ||
      code === 'ABORT_ERR' ||
      message.includes('AbortError') ||
      /(?:operation|request|stream) was aborted/i.test(message)
    ) {
      return true;
    }

    current = readProperty(current, 'cause');
  }

  return false;
}
