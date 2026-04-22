import storageUsageSchema from '../schema/storageUsage';
import type { IStorageUsage } from '~/types';

export function createStorageUsageModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.StorageUsage ||
    mongoose.model<IStorageUsage>('StorageUsage', storageUsageSchema)
  );
}
