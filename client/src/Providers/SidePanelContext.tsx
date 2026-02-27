import React, { createContext, useContext, useMemo } from 'react';
import type { EModelEndpoint } from 'librechat-data-provider';
import { useChatContext } from './ChatContext';

interface SidePanelContextValue {
  endpoint?: EModelEndpoint | null;
}

const SidePanelContext = createContext<SidePanelContextValue | undefined>(undefined);

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  let conversation;
  try {
    const chatContext = useChatContext();
    conversation = chatContext?.conversation;
  } catch {
    // ChatContext not available yet (e.g., before navigating to a chat route)
    conversation = undefined;
  }

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
  // Return a safe default if context is not available
  return context ?? { endpoint: undefined };
}
