import { createContext, useContext } from 'react';
import type { SearchResultData } from 'librechat-data-provider';
type MessageContext = {
  messageId: string;
  nextType?: string;
  partIndex?: number;
  isExpanded: boolean;
  conversationId?: string | null;
  searchResults?: { [key: string]: SearchResultData };
};

export const MessageContext = createContext<MessageContext>({} as MessageContext);
export const useMessageContext = () => useContext(MessageContext);
