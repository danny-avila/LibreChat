import type { Model } from 'mongoose';
import type { IResourceLock, ResourceLockAcquireData, ResourceLockReleaseData } from '~/types';
import { createIndexesWithRetry } from '~/utils/retry';

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error != null && (error as { code?: unknown }).code === 11000;
}

export function createResourceLockMethods(mongoose: typeof import('mongoose')): {
  acquireResourceLock: (data: ResourceLockAcquireData) => Promise<boolean>;
  releaseResourceLock: (data: ResourceLockReleaseData) => Promise<boolean>;
} {
  let indexesPromise: Promise<void> | null = null;

  function ensureIndexes(): Promise<void> {
    if (!indexesPromise) {
      const ResourceLock = mongoose.models.ResourceLock as Model<IResourceLock>;
      indexesPromise = createIndexesWithRetry(ResourceLock).catch((error) => {
        indexesPromise = null;
        throw error;
      });
    }
    return indexesPromise;
  }

  /**
   * Takes the lease for `key`, or takes over one whose holder let it expire.
   * Returns false while another owner holds a live lease.
   */
  async function acquireResourceLock({
    key,
    ownerId,
    ttlMs,
  }: ResourceLockAcquireData): Promise<boolean> {
    const ResourceLock = mongoose.models.ResourceLock as Model<IResourceLock>;
    await ensureIndexes();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      await ResourceLock.create({ key, ownerId, expiresAt });
      return true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
    const taken = await ResourceLock.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },
      { $set: { ownerId, expiresAt } },
      { new: true },
    ).lean();
    return taken != null;
  }

  /** Releases the lease only for the owner that holds it; anyone else is a no-op. */
  async function releaseResourceLock({ key, ownerId }: ResourceLockReleaseData): Promise<boolean> {
    const ResourceLock = mongoose.models.ResourceLock as Model<IResourceLock>;
    const result = await ResourceLock.deleteOne({ key, ownerId });
    return result.deletedCount > 0;
  }

  return { acquireResourceLock, releaseResourceLock };
}

export type ResourceLockMethods = ReturnType<typeof createResourceLockMethods>;
