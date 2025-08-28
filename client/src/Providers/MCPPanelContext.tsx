import React, { createContext, useContext, useMemo } from 'react';
import { Constants } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';

interface MCPPanelContextValue {
  conversationId: string;
}

const MCPPanelContext = createContext<MCPPanelContextValue | undefined>(undefined);

export function MCPPanelProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();

  /** Context value only created when conversationId changes */
  const contextValue = useMemo<MCPPanelContextValue>(
    () => ({
      conversationId: conversation?.conversationId ?? Constants.NEW_CONVO,
    }),
    [conversation?.conversationId],
  );

  return <MCPPanelContext.Provider value={contextValue}>{children}</MCPPanelContext.Provider>;
}

export function useMCPPanelContext() {
  const context = useContext(MCPPanelContext);
  if (!context) {
    throw new Error('useMCPPanelContext must be used within MCPPanelProvider');
  }
  return context;
}
