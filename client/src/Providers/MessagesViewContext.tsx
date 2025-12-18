import React, { createContext, useContext, useMemo } from 'react';
import { useAddedChatContext } from './AddedChatContext';
import { useChatContext } from './ChatContext';

interface MessagesViewContextValue {
  /** Core conversation data */
  conversation: ReturnType<typeof useChatContext>['conversation'];
  conversationId: string | null | undefined;

  /** Submission and control states */
  isSubmitting: ReturnType<typeof useChatContext>['isSubmitting'];
  isSubmittingFamily: boolean;
  abortScroll: ReturnType<typeof useChatContext>['abortScroll'];
  setAbortScroll: ReturnType<typeof useChatContext>['setAbortScroll'];

  /** Message operations */
  ask: ReturnType<typeof useChatContext>['ask'];
  regenerate: ReturnType<typeof useChatContext>['regenerate'];
  handleContinue: ReturnType<typeof useChatContext>['handleContinue'];

  /** Message state management */
  index: ReturnType<typeof useChatContext>['index'];
  latestMessage: ReturnType<typeof useChatContext>['latestMessage'];
  setLatestMessage: ReturnType<typeof useChatContext>['setLatestMessage'];
  getMessages: ReturnType<typeof useChatContext>['getMessages'];
  setMessages: ReturnType<typeof useChatContext>['setMessages'];
}

const MessagesViewContext = createContext<MessagesViewContextValue | undefined>(undefined);

// Export the context so it can be provided by other providers (e.g., ShareMessagesProvider)
export { MessagesViewContext };
export type { MessagesViewContextValue };

export function MessagesViewProvider({ children }: { children: React.ReactNode }) {
  const chatContext = useChatContext();
  const addedChatContext = useAddedChatContext();

  const {
    ask,
    index,
    regenerate,
    isSubmitting: isSubmittingRoot,
    conversation,
    latestMessage,
    setAbortScroll,
    handleContinue,
    setLatestMessage,
    abortScroll,
    getMessages,
    setMessages,
  } = chatContext;

  const { isSubmitting: isSubmittingAdditional } = addedChatContext;

  /** Memoize conversation-related values */
  const conversationValues = useMemo(
    () => ({
      conversation,
      conversationId: conversation?.conversationId,
    }),
    [conversation],
  );

  /** Memoize submission states */
  const submissionStates = useMemo(
    () => ({
      isSubmitting: isSubmittingRoot,
      isSubmittingFamily: isSubmittingRoot || isSubmittingAdditional,
      abortScroll,
      setAbortScroll,
    }),
    [isSubmittingRoot, isSubmittingAdditional, abortScroll, setAbortScroll],
  );

  /** Memoize message operations (these are typically stable references) */
  const messageOperations = useMemo(
    () => ({
      ask,
      regenerate,
      getMessages,
      setMessages,
      handleContinue,
    }),
    [ask, regenerate, handleContinue, getMessages, setMessages],
  );

  /** Memoize message state values */
  const messageState = useMemo(
    () => ({
      index,
      latestMessage,
      setLatestMessage,
    }),
    [index, latestMessage, setLatestMessage],
  );

  /** Combine all values into final context value */
  const contextValue = useMemo<MessagesViewContextValue>(
    () => ({
      ...conversationValues,
      ...submissionStates,
      ...messageOperations,
      ...messageState,
    }),
    [conversationValues, submissionStates, messageOperations, messageState],
  );

  return (
    <MessagesViewContext.Provider value={contextValue}>{children}</MessagesViewContext.Provider>
  );
}

export function useMessagesViewContext() {
  const context = useContext(MessagesViewContext);
  if (!context) {
    throw new Error('useMessagesViewContext must be used within MessagesViewProvider');
  }
  return context;
}

/** Hook for components that only need conversation data */
export function useMessagesConversation() {
  const { conversation, conversationId } = useMessagesViewContext();
  return useMemo(() => ({ conversation, conversationId }), [conversation, conversationId]);
}

/** Hook for components that only need submission states */
export function useMessagesSubmission() {
  const { isSubmitting, isSubmittingFamily, abortScroll, setAbortScroll } =
    useMessagesViewContext();
  return useMemo(
    () => ({ isSubmitting, isSubmittingFamily, abortScroll, setAbortScroll }),
    [isSubmitting, isSubmittingFamily, abortScroll, setAbortScroll],
  );
}

/** Hook for components that only need message operations */
export function useMessagesOperations() {
  const { ask, regenerate, handleContinue, getMessages, setMessages } = useMessagesViewContext();
  return useMemo(
    () => ({ ask, regenerate, handleContinue, getMessages, setMessages }),
    [ask, regenerate, handleContinue, getMessages, setMessages],
  );
}

/** Hook for components that only need message state */
export function useMessagesState() {
  const { index, latestMessage, setLatestMessage } = useMessagesViewContext();
  return useMemo(
    () => ({ index, latestMessage, setLatestMessage }),
    [index, latestMessage, setLatestMessage],
  );
}
