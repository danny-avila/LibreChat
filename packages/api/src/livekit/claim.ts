import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares via fixed-length digests so the check is constant-time regardless of input
 * length — `timingSafeEqual` throws on length mismatch, which would itself leak length.
 */
export const isWorkerSecretValid = (provided: unknown, expected: string): boolean => {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
};

export const WORKER_SECRET_HEADER = 'x-livekit-worker-secret';
