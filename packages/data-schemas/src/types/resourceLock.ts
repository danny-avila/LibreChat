import type { Document } from 'mongoose';

export interface IResourceLock extends Document {
  key: string;
  ownerId: string;
  expiresAt: Date;
}

export interface ResourceLockAcquireData {
  key: string;
  ownerId: string;
  ttlMs: number;
}

export interface ResourceLockReleaseData {
  key: string;
  ownerId: string;
}
