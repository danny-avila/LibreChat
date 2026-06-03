import type { Types } from 'mongoose';
import type { IMessage } from './message';

export interface ISharedLink {
  _id?: Types.ObjectId;
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  shareId?: string;
  targetMessageId?: string;
  expiredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ShareServiceError extends Error {
  code: string;
}

export interface SharedLinksResult {
  links: Array<{
    shareId: string;
    title: string;
    createdAt: Date;
    conversationId: string;
  }>;
  nextCursor?: Date;
  hasNextPage: boolean;
}

export interface SharedMessagesResult {
  conversationId: string;
  messages: Array<IMessage>;
  shareId: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateShareResult {
  _id?: string;
  shareId: string;
  conversationId: string;
  targetMessageId?: string;
}

export interface UpdateShareResult {
  _id?: string;
  shareId: string;
  conversationId: string;
  targetMessageId?: string;
}

export interface DeleteShareResult {
  _id?: string;
  success: boolean;
  shareId: string;
  message: string;
}

export interface GetShareLinkResult {
  _id?: string;
  shareId: string | null;
  targetMessageId?: string;
  success: boolean;
}

export interface DeleteAllSharesResult {
  message: string;
  deletedCount: number;
}
