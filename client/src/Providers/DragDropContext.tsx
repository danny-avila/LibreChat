import React, { createContext, useContext, useMemo } from 'react';
import { useChatContext } from './ChatContext';

interface DragDropContextValue {
  conversationId: string | null | undefined;
  agentId: string | null | undefined;
}

const DragDropContext = createContext<DragDropContextValue | undefined>(undefined);

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();

  /** Context value only created when conversation fields change */
  const contextValue = useMemo<DragDropContextValue>(
    () => ({
      conversationId: conversation?.conversationId,
      agentId: conversation?.agent_id,
    }),
    [conversation?.conversationId, conversation?.agent_id],
  );

  return <DragDropContext.Provider value={contextValue}>{children}</DragDropContext.Provider>;
}

export function useDragDropContext() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDropContext must be used within DragDropProvider');
  }
  return context;
}
