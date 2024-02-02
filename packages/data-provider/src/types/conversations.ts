// Define a type for individual conversation details
import type { TMessage, TConversation } from '../schemas';
export type Conversation = {
  id: string;
  createdAt: number;
  participants: string[]; // Array of participant identifiers
  lastMessage: string;
  conversations: TConversation[];

  // Additional fields as required by your application...
};

// Parameters for creating or updating a conversation
export type ConversationCreateParams = {
  participants: string[];
  // Other fields as needed...
};

export type ConversationUpdateParams = {
  // Fields that can be updated...
};

// Parameters for listing conversations (e.g., for pagination)
export type ConversationListParams = {
  limit?: number;
  before?: string | null;
  after?: string | null;
  order?: 'asc' | 'desc';
  pageNumber: string; // Add this line
  conversationId?: string;
};

// Type for the response from the conversation list API
export type ConversationListResponse = {
  conversations: TConversation[];
  pageNumber: string;
  pageSize: string | number;
  pages: string | number;
  messages: TMessage[];
};

// Additional types as needed...
