import { createContext, useContext } from 'react';
import useVeraChat from '~/hooks/useVeraChat';
type TChatContext = ReturnType<typeof useVeraChat>;

export const ChatContext = createContext<TChatContext>({} as TChatContext);
export const useChatContext = () => useContext(ChatContext);
