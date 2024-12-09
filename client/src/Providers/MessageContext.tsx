import { createContext, useContext } from 'react';
type MessageContext = {
  messageId: string;
  partIndex?: number;
  conversationId?: string | null;
};

export const MessageContext = createContext<MessageContext>({} as MessageContext);
export const useMessageContext = () => useContext(MessageContext);
