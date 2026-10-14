import { Types } from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import { ResourcePermissionsBusyError } from '~/acl/accessControlService';

export interface LeaseDeps {
  acquireResourceLock: (data: { key: string; ownerId: string; ttlMs: number }) => Promise<boolean>;
  renewResourceLock: (data: { key: string; ownerId: string; ttlMs: number }) => Promise<boolean>;
  releaseResourceLock: (data: { key: string; ownerId: string }) => Promise<boolean>;
}

const LEASE_TTL_MS = 30_000;
const LEASE_WAIT_MS = 3_000;
const LEASE_POLL_MS = 50;

/** One key per grant, with ObjectId hex case-folded the way the ACL lease key is. */
export function grantLeaseKey(
  principalType: string,
  principalId: string,
  capability: string,
  tenantId?: string,
): string {
  /** Role names are case-sensitive strings; only ObjectId-backed principals are canonicalized. */
  const id =
    principalType !== PrincipalType.ROLE && Types.ObjectId.isValid(principalId)
      ? new Types.ObjectId(principalId).toString()
      : principalId;
  return `grant:${principalType.toLowerCase()}:${id}:${capability}:${tenantId ?? ''}`;
}

/**
 * Runs `fn` while holding a lease on `key`, so the audit entry and the write of one
 * grant are ordered against a concurrent change of the same grant. `fence` re-validates
 * and extends the lease and throws `ResourcePermissionsBusyError` once it was lost.
 * Without lease deps `fn` runs unserialized.
 */
export async function withLease<T>(
  deps: LeaseDeps | undefined,
  key: string,
  fn: (fence: () => Promise<void>) => Promise<T>,
): Promise<T> {
  if (!deps) {
    return fn(async () => undefined);
  }
  const lock = { key, ownerId: new Types.ObjectId().toString() };
  const deadline = Date.now() + LEASE_WAIT_MS;
  while (!(await deps.acquireResourceLock({ ...lock, ttlMs: LEASE_TTL_MS }))) {
    if (Date.now() >= deadline) {
      throw new ResourcePermissionsBusyError();
    }
    await new Promise((resolve) => setTimeout(resolve, LEASE_POLL_MS));
  }
  let lost = false;
  const renew = async () => {
    /** Only a definitive "not the holder" answer loses the lease; a transient error may be retried. */
    if (lost || !(await deps.renewResourceLock({ ...lock, ttlMs: LEASE_TTL_MS }))) {
      lost = true;
      throw new ResourcePermissionsBusyError();
    }
  };
  /** Keeps the lease alive through slow audit writes between fences. */
  const heartbeat = setInterval(() => void renew().catch(() => undefined), LEASE_TTL_MS / 3);
  try {
    return await fn(renew);
  } finally {
    clearInterval(heartbeat);
    await deps.releaseResourceLock(lock).catch(() => undefined);
  }
}
