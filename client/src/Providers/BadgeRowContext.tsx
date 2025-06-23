import React, { createContext, useContext } from 'react';
import { Tools, LocalStorageKeys } from 'librechat-data-provider';
import { useMCPSelect, useToolToggle, useCodeApiKeyForm, useSearchApiKeyForm } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';

interface BadgeRowContextType {
  conversationId?: string | null;
  mcpSelect: ReturnType<typeof useMCPSelect>;
  webSearch: ReturnType<typeof useToolToggle>;
  codeInterpreter: ReturnType<typeof useToolToggle>;
  fileSearch: ReturnType<typeof useToolToggle>;
  codeApiKeyForm: ReturnType<typeof useCodeApiKeyForm>;
  searchApiKeyForm: ReturnType<typeof useSearchApiKeyForm>;
  startupConfig: ReturnType<typeof useGetStartupConfig>['data'];
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
  /** Startup config */
  const { data: startupConfig } = useGetStartupConfig();

  /** MCPSelect hook */
  const mcpSelect = useMCPSelect({ conversationId });

  /** CodeInterpreter hooks */
  const codeApiKeyForm = useCodeApiKeyForm({});
  const { setIsDialogOpen: setCodeDialogOpen } = codeApiKeyForm;

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

  /** WebSearch hooks */
  const searchApiKeyForm = useSearchApiKeyForm({});
  const { setIsDialogOpen: setWebSearchDialogOpen } = searchApiKeyForm;

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

  /** FileSearch hook */
  const fileSearch = useToolToggle({
    conversationId,
    toolKey: Tools.file_search,
    localStorageKey: LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_,
    isAuthenticated: true,
  });

  const value: BadgeRowContextType = {
    mcpSelect,
    webSearch,
    fileSearch,
    startupConfig,
    conversationId,
    codeApiKeyForm,
    codeInterpreter,
    searchApiKeyForm,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
