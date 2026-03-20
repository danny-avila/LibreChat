import type { Document, Types } from 'mongoose';

export interface IPrompt extends Document {
  groupId: Types.ObjectId;
  author: Types.ObjectId;
  prompt: string;
  type: 'text' | 'chat';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptGroup {
  name: string;
  numberOfGenerations: number;
  oneliner: string;
  category: string;
  projectIds: Types.ObjectId[];
  productionId: Types.ObjectId;
  author: Types.ObjectId;
  authorName: string;
  command?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isPublic?: boolean;
}

export interface IPromptGroupDocument extends IPromptGroup, Document {}
