import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSetRecoilState } from 'recoil';
import { Tools, Constants, LocalStorageKeys, AgentCapabilities } from 'librechat-data-provider';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import {
  useMCPServerManager,
  useSearchApiKeyForm,
  useGetAgentsConfig,
  useCodeApiKeyForm,
  useToolToggle,
} from '~/hooks';
import { getTimestampedValue, setTimestamp } from '~/utils/timestamps';
import { ephemeralAgentByConvoId } from '~/store';

interface BadgeRowContextType {
  conversationId?: string | null;
  agentsConfig?: TAgentsEndpoint | null;
  webSearch: ReturnType<typeof useToolToggle>;
  artifacts: ReturnType<typeof useToolToggle>;
  fileSearch: ReturnType<typeof useToolToggle>;
  codeInterpreter: ReturnType<typeof useToolToggle>;
  codeApiKeyForm: ReturnType<typeof useCodeApiKeyForm>;
  searchApiKeyForm: ReturnType<typeof useSearchApiKeyForm>;
  mcpServerManager: ReturnType<typeof useMCPServerManager>;
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
  isSubmitting?: boolean;
  conversationId?: string | null;
}

export default function BadgeRowProvider({
  children,
  isSubmitting,
  conversationId,
}: BadgeRowProviderProps) {
  const lastKeyRef = useRef<string>('');
  const hasInitializedRef = useRef(false);
  const { agentsConfig } = useGetAgentsConfig();
  const key = conversationId ?? Constants.NEW_CONVO;

  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(key));

  /** Initialize ephemeralAgent from localStorage on mount and when conversation changes */
  useEffect(() => {
    if (isSubmitting) {
      return;
    }
    // Check if this is a new conversation or the first load
    if (!hasInitializedRef.current || lastKeyRef.current !== key) {
      hasInitializedRef.current = true;
      lastKeyRef.current = key;

      const codeToggleKey = `${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`;
      const webSearchToggleKey = `${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`;
      const fileSearchToggleKey = `${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${key}`;
      const artifactsToggleKey = `${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${key}`;

      const codeToggleValue = getTimestampedValue(codeToggleKey);
      const webSearchToggleValue = getTimestampedValue(webSearchToggleKey);
      const fileSearchToggleValue = getTimestampedValue(fileSearchToggleKey);
      const artifactsToggleValue = getTimestampedValue(artifactsToggleKey);

      const initialValues: Record<string, any> = {};

      if (codeToggleValue !== null) {
        try {
          initialValues[Tools.execute_code] = JSON.parse(codeToggleValue);
        } catch (e) {
          console.error('Failed to parse code toggle value:', e);
        }
      }

      if (webSearchToggleValue !== null) {
        try {
          initialValues[Tools.web_search] = JSON.parse(webSearchToggleValue);
        } catch (e) {
          console.error('Failed to parse web search toggle value:', e);
        }
      }

      if (fileSearchToggleValue !== null) {
        try {
          initialValues[Tools.file_search] = JSON.parse(fileSearchToggleValue);
        } catch (e) {
          console.error('Failed to parse file search toggle value:', e);
        }
      }

      if (artifactsToggleValue !== null) {
        try {
          initialValues[AgentCapabilities.artifacts] = JSON.parse(artifactsToggleValue);
        } catch (e) {
          console.error('Failed to parse artifacts toggle value:', e);
        }
      }

      /**
       * Always set values for all tools (use defaults if not in `localStorage`)
       * If `ephemeralAgent` is `null`, create a new object with just our tool values
       */
      const finalValues = {
        [Tools.execute_code]: initialValues[Tools.execute_code] ?? false,
        [Tools.web_search]: initialValues[Tools.web_search] ?? false,
        [Tools.file_search]: initialValues[Tools.file_search] ?? false,
        [AgentCapabilities.artifacts]: initialValues[AgentCapabilities.artifacts] ?? false,
      };

      setEphemeralAgent((prev) => ({
        ...(prev || {}),
        ...finalValues,
      }));

      Object.entries(finalValues).forEach(([toolKey, value]) => {
        if (value !== false) {
          let storageKey = artifactsToggleKey;
          if (toolKey === Tools.execute_code) {
            storageKey = codeToggleKey;
          } else if (toolKey === Tools.web_search) {
            storageKey = webSearchToggleKey;
          } else if (toolKey === Tools.file_search) {
            storageKey = fileSearchToggleKey;
          }
          // Store the value and set timestamp for existing values
          localStorage.setItem(storageKey, JSON.stringify(value));
          setTimestamp(storageKey);
        }
      });
    }
  }, [key, isSubmitting, setEphemeralAgent]);

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

  /** Artifacts hook - using a custom key since it's not a Tool but a capability */
  const artifacts = useToolToggle({
    conversationId,
    toolKey: AgentCapabilities.artifacts,
    localStorageKey: LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_,
    isAuthenticated: true,
  });

  const mcpServerManager = useMCPServerManager({ conversationId });

  const value: BadgeRowContextType = {
    webSearch,
    artifacts,
    fileSearch,
    agentsConfig,
    conversationId,
    codeApiKeyForm,
    codeInterpreter,
    searchApiKeyForm,
    mcpServerManager,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
