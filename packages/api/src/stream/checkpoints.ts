import { randomUUID } from 'crypto';

export const DEFAULT_CHECKPOINT_TTL_SECONDS: number = 24 * 60 * 60;
export const CHECKPOINT_RECEIPT_GRACE_SECONDS: number = 5 * 60;

const CHECKPOINT_NAMESPACE_PREFIX = 'lcg:v1:';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createCheckpointNamespace(): string {
  return `${CHECKPOINT_NAMESPACE_PREFIX}${randomUUID()}`;
}

export function isCleanupSafeCheckpointNamespace(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(CHECKPOINT_NAMESPACE_PREFIX) &&
    UUID_V4_PATTERN.test(value.slice(CHECKPOINT_NAMESPACE_PREFIX.length))
  );
}

export function normalizeCheckpointTtlSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : DEFAULT_CHECKPOINT_TTL_SECONDS;
}

export function checkpointReceiptExpiry(
  checkpointTtlSeconds: unknown,
  lifecycleTtlSeconds: number,
  now: number = Date.now(),
): number {
  const ttlMs =
    (normalizeCheckpointTtlSeconds(checkpointTtlSeconds) +
      Math.max(0, Math.ceil(lifecycleTtlSeconds)) +
      CHECKPOINT_RECEIPT_GRACE_SECONDS) *
    1000;
  return Math.min(Number.MAX_SAFE_INTEGER, now + ttlMs);
}
