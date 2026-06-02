import type { Document, Types } from 'mongoose';

export type SkillSyncProvider = 'github';
export type SkillSyncRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface ISkillSyncCredential {
  provider: SkillSyncProvider;
  credentialKey: string;
  encryptedToken: string;
  tokenHash: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISkillSyncCredentialDocument extends ISkillSyncCredential, Document {}

export interface ISkillSyncStatus {
  provider: SkillSyncProvider;
  sourceId: string;
  tenantId?: string;
  status: SkillSyncRunStatus;
  credentialKey?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  paths?: string[];
  startedAt?: Date;
  finishedAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  syncedSkillCount: number;
  syncedFileCount: number;
  deletedSkillCount: number;
  deletedFileCount: number;
  lockOwner?: string;
  lockExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISkillSyncStatusDocument extends ISkillSyncStatus, Document {}
