import React, { createContext, useContext, useMemo } from 'react';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';

interface SidePanelContextValue {
  endpoint?: EModelEndpoint | null;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(undefined);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const { conversation } = useChatContext();

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
  return context ?? { endpoint: undefined };
}
