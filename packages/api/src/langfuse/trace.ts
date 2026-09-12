import { createHash } from 'crypto';

type TraceRefFields = {
  langfuseSampled?: boolean | null;
  langfuseDestinationIds?: string[] | null;
};

export function traceIdForMessage(messageId: string): string {
  return createHash('sha256').update(messageId, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Drops a message's trace sampling record. A copied message gets a new id, and
 * its trace id derives from that id, so the source's record would claim a trace
 * the copy never produced — for feedback scores and the trace viewer alike.
 */
export function withoutTraceRefs<T extends TraceRefFields>(
  message: T,
): Omit<T, keyof TraceRefFields> {
  const { langfuseSampled: _sampled, langfuseDestinationIds: _destinations, ...rest } = message;
  return rest;
}
