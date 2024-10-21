import type { InfiniteData } from '@tanstack/react-query';
import type * as t from '../types';
import type { TMessage, TConversation, TSharedLink, TConversationTag } from '../schemas';

export type Conversation = {
  id: string;
  createdAt: number;
  participants: string[];
  lastMessage: string;
  conversations: TConversation[];
};

// Parameters for listing conversations (e.g., for pagination)
export type ConversationListParams = {
  limit?: number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  pageNumber: string;
  conversationId?: string;
  isArchived?: boolean;
  tags?: string[];
};

// Type for the response from the conversation list API
export type ConversationListResponse = {
  conversations: TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
  messages: TMessage[];
};

export type ConversationData = InfiniteData<ConversationListResponse>;
export type ConversationUpdater = (
  data: ConversationData,
  conversation: TConversation,
) => ConversationData;

export type SharedMessagesResponse = Omit<TSharedLink, 'messages'> & {
  messages: TMessage[];
};
export type SharedLinkListParams = Omit<ConversationListParams, 'isArchived' | 'conversationId'> & {
  isPublic?: boolean;
};

export type SharedLinksResponse = Omit<ConversationListResponse, 'conversations' | 'messages'> & {
  sharedLinks: TSharedLink[];
};

// Type for the response from the conversation list API
export type SharedLinkListResponse = {
  sharedLinks: TSharedLink[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
};

export type SharedLinkListData = InfiniteData<SharedLinkListResponse>;

export type AllPromptGroupsFilterRequest = {
  category: string;
  pageNumber: string;
  pageSize: string | number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  name?: string;
  author?: string;
};

export type AllPromptGroupsResponse = t.TPromptGroup[];

export type ConversationTagsResponse = TConversationTag[];

export type VerifyToolAuthParams = { toolId: string };
export type VerifyToolAuthResponse = { authenticated: boolean };
