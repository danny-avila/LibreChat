import React, { createContext, useContext, useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';
import { getLatestText } from '~/utils';

interface ArtifactsContextValue {
  isSubmitting: boolean;
  latestMessageId: string | null;
  latestMessageText: string;
  conversationId: string | null;
}

const ArtifactsContext = createContext<ArtifactsContextValue | undefined>(undefined);

export function ArtifactsProvider({ children }: { children: React.ReactNode }) {
  const { isSubmitting, latestMessage, conversation } = useChatContext();

  const latestMessageText = useMemo(() => {
    return getLatestText({
      messageId: latestMessage?.messageId ?? null,
      text: latestMessage?.text ?? null,
      content: latestMessage?.content ?? null,
    } as TMessage);
  }, [latestMessage?.messageId, latestMessage?.text, latestMessage?.content]);

  /** Context value only created when relevant values change */
  const contextValue = useMemo<ArtifactsContextValue>(
    () => ({
      isSubmitting,
      latestMessageText,
      latestMessageId: latestMessage?.messageId ?? null,
      conversationId: conversation?.conversationId ?? null,
    }),
    [isSubmitting, latestMessage?.messageId, latestMessageText, conversation?.conversationId],
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
