import type { Document, Types } from 'mongoose';
import type { MemoryScope } from './memoryDocument';

export type SynthesisStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ISynthesisRun extends Document {
  userId: Types.ObjectId;
  scope: MemoryScope;
  projectId?: Types.ObjectId;
  status: SynthesisStatus;
  conversationsProcessed: number;
  memoriesCreated: number;
  memoriesUpdated: number;
  memoriesDeleted: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ISynthesisRunLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scope: MemoryScope;
  projectId?: Types.ObjectId;
  status: SynthesisStatus;
  conversationsProcessed: number;
  memoriesCreated: number;
  memoriesUpdated: number;
  memoriesDeleted: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  __v?: number;
}
