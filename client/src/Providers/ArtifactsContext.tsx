import React, { createContext, useContext, useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';
import { getLatestText } from '~/utils';

export interface ArtifactsContextValue {
  isSubmitting: boolean;
  latestMessageId: string | null;
  latestMessageText: string;
  conversationId: string | null;
}

const ArtifactsContext = createContext<ArtifactsContextValue | undefined>(undefined);

interface ArtifactsProviderProps {
  children: React.ReactNode;
  value?: Partial<ArtifactsContextValue>;
}

export function ArtifactsProvider({ children, value }: ArtifactsProviderProps) {
  const { isSubmitting, latestMessage, conversation } = useChatContext();

  const chatLatestMessageText = useMemo(() => {
    return getLatestText({
      messageId: latestMessage?.messageId ?? null,
      text: latestMessage?.text ?? null,
      content: latestMessage?.content ?? null,
    } as TMessage);
  }, [latestMessage?.messageId, latestMessage?.text, latestMessage?.content]);

  const defaultContextValue = useMemo<ArtifactsContextValue>(
    () => ({
      isSubmitting,
      latestMessageText: chatLatestMessageText,
      latestMessageId: latestMessage?.messageId ?? null,
      conversationId: conversation?.conversationId ?? null,
    }),
    [isSubmitting, chatLatestMessageText, latestMessage?.messageId, conversation?.conversationId],
  );

  /** Context value only created when relevant values change */
  const contextValue = useMemo<ArtifactsContextValue>(
    () => (value ? { ...defaultContextValue, ...value } : defaultContextValue),
    [defaultContextValue, value],
  );

  return <ArtifactsContext.Provider value={contextValue}>{children}</ArtifactsContext.Provider>;
}

export function useArtifactsContext() {
  const context = useContext(ArtifactsContext);
  if (!context) {
    throw new Error('useArtifactsContext must be used within ArtifactsProvider');
  }
  return context;
}
