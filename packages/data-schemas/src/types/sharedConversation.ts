import type { Types } from 'mongoose';

export interface ISharedConversation {
  _id?: Types.ObjectId;
  conversationId: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  sharedWithUserId: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SharedConversationUser {
  id: string;
  name?: string;
  email?: string;
}

export interface SharedConversationListItem {
  conversationId: string;
  ownerId: string;
  ownerName?: string;
  ownerEmail?: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
  endpoint?: string;
}

export interface SharedConversationResult {
  shares: SharedConversationListItem[];
  nextCursor?: Date;
  hasNextPage: boolean;
}

export interface ShareWithUsersResult {
  success: boolean;
  sharedWith: string[];
  message: string;
}

export interface RevokeShareResult {
  success: boolean;
  message: string;
}

export interface GetConversationSharesResult {
  conversationId: string;
  sharedWith: SharedConversationUser[];
}
