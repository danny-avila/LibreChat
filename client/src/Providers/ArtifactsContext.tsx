import React, { createContext, useContext, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { getLatestText } from '~/utils';
import store from '~/store';

export interface ArtifactsContextValue {
  isSubmitting: boolean;
  latestMessageId: string | null;
  latestMessageText: string;
  latestMessageError: boolean;
  conversationId: string | null;
}

const ArtifactsContext = createContext<ArtifactsContextValue | undefined>(undefined);

interface ArtifactsProviderProps {
  children: React.ReactNode;
  value?: Partial<ArtifactsContextValue>;
}

export function ArtifactsProvider({ children, value }: ArtifactsProviderProps) {
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const latestMessage = useLatestMessage(0);
  const conversationId = useRecoilValue(store.conversationIdByIndex(0));

  const chatLatestMessageText = useMemo(() => {
    return getLatestText(latestMessage);
  }, [latestMessage]);

  /**
   * A tool-call-limit pause also sets `unfinished: true` even though nothing
   * failed or was cancelled — its distinct `finish_reason` is what excludes
   * it here, so a paused-but-valid generation still registers its artifacts.
   */
  const latestMessageError =
    latestMessage?.error === true ||
    (latestMessage?.unfinished === true &&
      latestMessage.finish_reason !== Constants.TOOL_CALL_LIMIT_FINISH_REASON);

  const defaultContextValue = useMemo<ArtifactsContextValue>(
    () => ({
      isSubmitting,
      conversationId: conversationId ?? null,
      latestMessageText: chatLatestMessageText,
      latestMessageId: latestMessage?.messageId ?? null,
      latestMessageError,
    }),
    [
      isSubmitting,
      chatLatestMessageText,
      latestMessage?.messageId,
      latestMessageError,
      conversationId,
    ],
  );

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
