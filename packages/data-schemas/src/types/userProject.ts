import type { Document, Types } from 'mongoose';

export interface IUserProject extends Document {
  projectId: string;
  user: Types.ObjectId;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  fileIds?: string[];
  memory?: IProjectMemoryEntry[];
  defaultModel?: string;
  defaultEndpoint?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IProjectMemoryEntry {
  key: string;
  value: string;
}

export interface IUserProjectLean {
  _id: Types.ObjectId;
  projectId: string;
  user: Types.ObjectId;
  name: string;
  description?: string;
  instructions?: string;
  color?: string;
  icon?: string;
  fileIds?: string[];
  memory?: IProjectMemoryEntry[];
  defaultModel?: string;
  defaultEndpoint?: string;
  conversationCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
