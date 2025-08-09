export interface RequestBody {
  parentMessageId: string;
  messageId: string;
  conversationId?: string;
  [key: string]: unknown;
}

