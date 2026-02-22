import type { Types, Document } from 'mongoose';

// Base memory interfaces
export interface IMemoryEntry extends Document {
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
}

export interface IMemoryEntryLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
  updated_at?: Date;
  __v?: number;
}

// Method parameter interfaces
export interface SetMemoryParams {
  userId: string | Types.ObjectId;
  key: string;
  value: string;
  tokenCount?: number;
}

export interface DeleteMemoryParams {
  userId: string | Types.ObjectId;
  key: string;
}

export interface GetFormattedMemoriesParams {
  userId: string | Types.ObjectId;
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
