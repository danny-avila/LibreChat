import { createContext, useContext } from 'react';
import useChatHelpers from '~/hooks/Chat/useChatHelpers';
type TChatContext = ReturnType<typeof useChatHelpers>;

// Provide a default context value with no-op functions to prevent errors
const createDefaultContext = (): TChatContext =>
  ({
    setFilesLoading: () => {},
    setFiles: () => {},
    setMessages: () => {},
    setConversation: () => {},
    setIsSubmitting: () => {},
    setLatestMessage: () => {},
    setShowPopover: () => {},
    setAbortScroll: () => {},
    setPreset: () => {},
    setOptionSettings: () => {},
    setSiblingIdx: () => {},
    resetLatestMessage: () => {},
    stopGenerating: async () => {},
    handleStopGenerating: () => {},
    handleRegenerate: () => {},
    handleContinue: () => {},
    getMessages: () => undefined,
  }) as unknown as TChatContext;

export const ChatContext = createContext<TChatContext>(createDefaultContext());
export const useChatContext = () => useContext(ChatContext);
