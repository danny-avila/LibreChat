import type { ObjectId } from './index';

export interface IStorageUsage {
  _id?: ObjectId;
  user: ObjectId;
  bytesLimit?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}
