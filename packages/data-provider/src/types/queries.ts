import type { InfiniteData } from '@tanstack/react-query';
import type * as a from '../types/agents';
import type * as s from '../schemas';
import type * as t from '../types';

export type Conversation = {
  id: string;
  createdAt: number;
  participants: string[];
  lastMessage: string;
  conversations: s.TConversation[];
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
  conversations: s.TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
  messages: s.TMessage[];
};

export type ConversationData = InfiniteData<ConversationListResponse>;
export type ConversationUpdater = (
  data: ConversationData,
  conversation: s.TConversation,
) => ConversationData;

export type SharedMessagesResponse = Omit<s.TSharedLink, 'messages'> & {
  messages: s.TMessage[];
};

export type SharedLinkListParams = {
  pageNumber: number;
  pageSize: number;
  isPublic: boolean;
  sortBy: 'createdAt' | 'title';
  sortDirection: 'asc' | 'desc';
  search?: string;
};

export type SharedLinkItem = {
  shareId: string;
  title: string;
  isPublic: boolean;
  createdAt: Date;
};

export type SharedLinksResponse = {
  links: SharedLinkItem[];
  totalCount: number;
  pages: number;
  pageNumber: number;
  pageSize: number;
};

// Type for the response from the conversation list API
export type SharedLinkListResponse = {
  sharedLinks: s.TSharedLink[];
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

export type ConversationTagsResponse = s.TConversationTag[];

export type VerifyToolAuthParams = { toolId: string };
export type VerifyToolAuthResponse = { authenticated: boolean; message?: string | s.AuthType };

export type GetToolCallParams = { conversationId: string };
export type ToolCallResults = a.ToolCallResult[];
