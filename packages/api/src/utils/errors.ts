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
