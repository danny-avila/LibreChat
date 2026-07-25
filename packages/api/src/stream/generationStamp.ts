/**
 * Mints the next generation stamp for a streamId.
 *
 * `createdAt` is the de-facto generation fence throughout the stream layer, but a
 * streamId is deliberately REUSED across generations (streamId === conversationId), and
 * `Date.now()` has millisecond resolution. Two createJob calls for the same streamId
 * inside one millisecond would therefore mint identical tokens, and a stale caller's
 * CAS guard would pass against the replacement generation it was meant to exclude.
 *
 * Forcing strict monotonicity per streamId closes that without introducing a second
 * identity field: the stamp is still a timestamp (so every existing comparison and the
 * TTL/staleness arithmetic keep working) but is guaranteed to differ between successive
 * generations of the same stream.
 */
export function nextGenerationStamp(previousCreatedAt?: number): number {
  const now = Date.now();
  if (previousCreatedAt == null || now > previousCreatedAt) {
    return now;
  }
  return previousCreatedAt + 1;
}
