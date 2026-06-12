import { createHash } from 'crypto';

export function traceIdForMessage(messageId: string): string {
  return createHash('sha256').update(messageId, 'utf8').digest('hex').slice(0, 32);
}
