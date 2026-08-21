import type { Types, Document } from 'mongoose';

/**
 * Partition an entry belongs to. Omitting every field addresses the shared
 * personal pool; the fields are independent, so a project's memories stay
 * separate from an agent's.
 */
export interface MemoryPartition {
  /** Agent partition; omit for the shared personal pool */
  agentId?: string;
  /** Chat project partition; omit for memories not scoped to a project */
  chatProjectId?: string;
}

// Base memory interfaces
export interface IMemoryEntry extends Document, MemoryPartition {
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  tenantId?: string;
}

export interface IMemoryEntryLean extends MemoryPartition {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  __v?: number;
}

// Method parameter interfaces
export interface SetMemoryParams extends MemoryPartition {
  userId: string | Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
}

export interface DeleteMemoryParams extends MemoryPartition {
  userId: string | Types.ObjectId;
  key: string;
}

export interface GetUserMemoriesParams extends MemoryPartition {
  userId: string | Types.ObjectId;
}

export interface GetFormattedMemoriesParams extends MemoryPartition {
  userId: string | Types.ObjectId;
}

export interface DeleteProjectMemoriesParams {
  userId: string | Types.ObjectId;
  chatProjectId: string;
}

// Result interfaces
export interface MemoryResult {
  ok: boolean;
}

export interface FormattedMemoriesResult {
  withKeys: string;
  withoutKeys: string;
  totalTokens?: number;
}
