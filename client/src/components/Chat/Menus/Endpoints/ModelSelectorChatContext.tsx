import React, { createContext, useContext, useMemo } from 'react';
import type { EModelEndpoint, TConversation } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';

interface ModelSelectorChatContextValue {
  endpoint?: EModelEndpoint | null;
  model?: string | null;
  spec?: string | null;
  agent_id?: string | null;
  assistant_id?: string | null;
  conversation: TConversation | null;
  newConversation: ReturnType<typeof useChatContext>['newConversation'];
}

const ModelSelectorChatContext = createContext<ModelSelectorChatContextValue | undefined>(
  undefined,
);

export function ModelSelectorChatProvider({ children }: { children: React.ReactNode }) {
  const { conversation, newConversation } = useChatContext();

  /** Context value only created when relevant conversation properties change */
  const contextValue = useMemo<ModelSelectorChatContextValue>(
    () => ({
      endpoint: conversation?.endpoint,
      model: conversation?.model,
      spec: conversation?.spec,
      agent_id: conversation?.agent_id,
      assistant_id: conversation?.assistant_id,
      conversation,
      newConversation,
    }),
    [conversation, newConversation],
  );

  return (
    <ModelSelectorChatContext.Provider value={contextValue}>
      {children}
    </ModelSelectorChatContext.Provider>
  );
}

export function useModelSelectorChatContext() {
  const context = useContext(ModelSelectorChatContext);
  if (!context) {
    throw new Error('useModelSelectorChatContext must be used within ModelSelectorChatProvider');
  }
  return context;
}
