import { FileContext } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { IStorageUsage } from '~/types';

export function createStorageUsageMethods(mongoose: typeof import('mongoose')) {
  /**
   * Live storage usage for a user. Aggregates `files.bytes` on every call —
   * the files collection is the source of truth, no drift possible.
   *
   * Per-user bytesLimit override is read from `storageusages`; when absent,
   * falls back to the caller-supplied `defaultLimit`.
   */
  async function getStorageUsage(
    userId: string,
    defaultLimit: number | null = null,
  ): Promise<{ bytesUsed: number; bytesLimit: number | null }> {
    const StorageUsage = mongoose.models.StorageUsage as Model<IStorageUsage>;
    const File = mongoose.models.File;

    const [agg, doc] = await Promise.all([
      File.aggregate<{ totalBytes: number }>([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            context: { $ne: FileContext.avatar },
          },
        },
        { $group: { _id: null, totalBytes: { $sum: '$bytes' } } },
      ]),
      StorageUsage.findOne({ user: userId }).lean<IStorageUsage>(),
    ]);

    const override =
      typeof doc?.bytesLimit === 'number' && doc.bytesLimit >= 0 ? doc.bytesLimit : null;

    return {
      bytesUsed: agg[0]?.totalBytes ?? 0,
      bytesLimit: override ?? defaultLimit,
    };
  }

  async function deleteStorageUsage(filter: { user: string }): Promise<void> {
    const StorageUsage = mongoose.models.StorageUsage as Model<IStorageUsage>;
    await StorageUsage.deleteOne(filter);
  }

  return { getStorageUsage, deleteStorageUsage };
}

export type StorageUsageMethods = ReturnType<typeof createStorageUsageMethods>;
