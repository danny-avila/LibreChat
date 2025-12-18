import React, { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';
import type { MessagesViewContextValue } from '~/Providers/MessagesViewContext';

interface ShareMessagesProviderProps {
  messages: TMessage[];
  children: React.ReactNode;
}

/**
 * Minimal MessagesViewContext provider for share view.
 * Provides conversation data needed by message components.
 * Uses the same MessagesViewContext as the main app for compatibility with existing hooks.
 *
 * Note: conversationId is set to undefined because share view is read-only and doesn't
 * need to check Recoil state for in-flight messages during streaming.
 */
export function ShareMessagesProvider({ messages, children }: ShareMessagesProviderProps) {
  const contextValue = useMemo<MessagesViewContextValue>(
    () => ({
      conversation: null,
      conversationId: undefined,
      // These are required by the context but not used in share view
      ask: () => Promise.resolve(),
      regenerate: () => {},
      handleContinue: () => {},
      latestMessage: messages[messages.length - 1] ?? null,
      isSubmitting: false,
      isSubmittingFamily: false,
      abortScroll: false,
      setAbortScroll: () => {},
      index: 0,
      setLatestMessage: () => {},
      getMessages: () => messages,
      setMessages: () => {},
    }),
    [messages],
  );

  return (
    <MessagesViewContext.Provider value={contextValue}>{children}</MessagesViewContext.Provider>
  );
}
