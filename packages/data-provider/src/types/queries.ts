import type { InfiniteData } from '@tanstack/react-query';
import type { TMessage, TConversation } from '../schemas';
export type EndpointKeyTypes = 'google' | 'openAI' | 'anthropic' | 'sdImage' | null;
export type SortKeyTypes =
  | 'participants-asc'
  | 'participants-desc'
  | 'date-asc'
  | 'date-desc'
  | 'none';
export interface SearchOptions {
  endpoint: EndpointKeyTypes;
  sort: SortKeyTypes;
}

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
  pageNumber: string; // Add this line
  conversationId?: string;
  roomIndex?: 'user' | 'all';
  searchOptions: SearchOptions;
  convoType?: 'r' | 'c';
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
