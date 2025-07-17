import React, { createContext, useContext, useMemo } from 'react';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';

interface SidePanelContextValue {
  endpoint?: EModelEndpoint | null;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(undefined);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();

  /** Context value only created when endpoint changes */
  const contextValue = useMemo<SidePanelContextValue>(
    () => ({
      endpoint: conversation?.endpoint,
    }),
    [conversation?.endpoint],
  );

  return <SidePanelContext.Provider value={contextValue}>{children}</SidePanelContext.Provider>;
}

export function useSidePanelContext() {
  const context = useContext(SidePanelContext);
  if (!context) {
    throw new Error('useSidePanelContext must be used within SidePanelProvider');
  }
  return context;
}
