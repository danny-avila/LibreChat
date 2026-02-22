import type { Document, Types } from 'mongoose';

export type MemoryScope = 'global' | 'project';

export interface IMemoryDocument extends Document {
  userId: Types.ObjectId;
  scope: MemoryScope;
  projectId?: Types.ObjectId;
  content: string;
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMemoryDocumentLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scope: MemoryScope;
  projectId?: Types.ObjectId;
  content: string;
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface ScopedMemoryResult {
  globalContent: string;
  projectContent: string;
  projectName: string;
  totalTokens: number;
}

export interface GetMemoryDocumentsParams {
  userId: string | Types.ObjectId;
  projectId?: string | Types.ObjectId | null;
}

export interface UpsertMemoryDocumentParams {
  userId: string | Types.ObjectId;
  scope: MemoryScope;
  projectId?: string | Types.ObjectId | null;
  content: string;
  tokenCount: number;
}
