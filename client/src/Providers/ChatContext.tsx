import { createContext, useContext } from 'react';
import useChatHelpers from '~/hooks/useChatHelpers';
type TChatContext = ReturnType<typeof useChatHelpers>;

export const ChatContext = createContext<TChatContext>({} as TChatContext);
export const useChatContext = () => useContext(ChatContext);
