import React, { createContext, useContext, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { EModelEndpoint } from 'librechat-data-provider';
import store from '~/store';

interface SidePanelContextValue {
  endpoint?: EModelEndpoint | null;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(undefined);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const conversation = useRecoilValue(store.conversationByIndex(0));

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
