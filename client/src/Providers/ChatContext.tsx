import { createContext, useContext } from 'react';
import useChatHelpers from '~/hooks/Chat/useChatHelpers';
type TChatContext = ReturnType<typeof useChatHelpers>;

export const ChatContext = createContext<TChatContext | null>(null);
export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a ChatContext.Provider');
  }
  return ctx;
};
