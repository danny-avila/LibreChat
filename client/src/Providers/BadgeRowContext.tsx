import React, { createContext, useContext } from 'react';
import { useMCPSelect, useToolToggle, useCodeApiKeyForm, useSearchApiKeyForm } from '~/hooks';
import { Tools, LocalStorageKeys } from 'librechat-data-provider';

interface BadgeRowContextType {
  conversationId?: string | null;
  mcpSelect: ReturnType<typeof useMCPSelect>;
  codeInterpreter: ReturnType<typeof useToolToggle>;
  webSearch: ReturnType<typeof useToolToggle>;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  const context = useContext(BadgeRowContext);
  if (context === undefined) {
    throw new Error('useBadgeRowContext must be used within a BadgeRowProvider');
  }
  return context;
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  conversationId?: string | null;
}

export default function BadgeRowProvider({ children, conversationId }: BadgeRowProviderProps) {
  // MCPSelect hook
  const mcpSelect = useMCPSelect({ conversationId });

  // CodeInterpreter hooks
  const { setIsDialogOpen: setCodeDialogOpen } = useCodeApiKeyForm({});

  const codeInterpreter = useToolToggle({
    conversationId,
    setIsDialogOpen: setCodeDialogOpen,
    toolKey: Tools.execute_code,
    localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
    authConfig: {
      toolId: Tools.execute_code,
      queryOptions: { retry: 1 },
    },
  });

  // WebSearch hooks
  const { setIsDialogOpen: setWebSearchDialogOpen } = useSearchApiKeyForm({});

  const webSearch = useToolToggle({
    conversationId,
    toolKey: Tools.web_search,
    localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
    setIsDialogOpen: setWebSearchDialogOpen,
    authConfig: {
      toolId: Tools.web_search,
      queryOptions: { retry: 1 },
    },
  });

  const value: BadgeRowContextType = {
    conversationId,
    mcpSelect,
    codeInterpreter,
    webSearch,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
