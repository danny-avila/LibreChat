import { renderHook, act, waitFor } from '@testing-library/react';
import { RecoilRoot, useRecoilState } from 'recoil';
import { QueryClientProvider } from '@tanstack/react-query';
import { Tools, Constants, LocalStorageKeys, AgentCapabilities } from 'librechat-data-provider';
import BadgeRowProvider, { useBadgeRowContext } from '../BadgeRowContext';
import { ephemeralAgentByConvoId } from '../../store';
import * as hooks from '../../hooks';
import * as dataProvider from '../../data-provider';
import { createQueryClient } from '~/test-utils/renderHelpers';

jest.mock('../../hooks', () => ({
  useGetAgentsConfig: jest.fn(),
  useSearchApiKeyForm: jest.fn(),
  useCodeApiKeyForm: jest.fn(),
  useToolToggle: jest.fn(),
  useMCPSelect: jest.fn(),
}));

jest.mock('../../data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

const mockSetIsDialogOpen = jest.fn();
const mockSetIsEnabled = jest.fn();
const mockMCPSelectData = { mcp: [], setMcp: jest.fn() };

const mockToolToggleResponse = {
  isEnabled: false,
  setIsEnabled: mockSetIsEnabled,
  isLoading: false,
  error: null,
};

const createWrapper = ({ conversationId = 'test-convo-id', isSubmitting = false } = {}) => {
  const queryClient = createQueryClient();

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <BadgeRowProvider conversationId={conversationId} isSubmitting={isSubmitting}>
          {children}
        </BadgeRowProvider>
      </RecoilRoot>
    </QueryClientProvider>
  );

  return Wrapper;
};

describe('BadgeRowProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    (hooks.useGetAgentsConfig as jest.Mock).mockReturnValue({
      agentsConfig: { enabled: true, name: 'Test Agent' },
    });

    (hooks.useSearchApiKeyForm as jest.Mock).mockReturnValue({
      setIsDialogOpen: mockSetIsDialogOpen,
    });

    (hooks.useCodeApiKeyForm as jest.Mock).mockReturnValue({
      setIsDialogOpen: mockSetIsDialogOpen,
    });

    (hooks.useMCPSelect as jest.Mock).mockReturnValue(mockMCPSelectData);

    (hooks.useToolToggle as jest.Mock).mockReturnValue(mockToolToggleResponse);

    (dataProvider.useGetStartupConfig as jest.Mock).mockReturnValue({
      data: { mcpServers: {} },
    });
  });

  describe('Context Provider', () => {
    it('should provide context values', () => {
      const { result } = renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper(),
      });

      expect(result.current.agentsConfig).toEqual({ enabled: true, name: 'Test Agent' });
      expect(result.current.conversationId).toBe('test-convo-id');
      expect(result.current.startupConfig).toEqual({ mcpServers: {} });
      expect(result.current.mcpSelect).toBe(mockMCPSelectData);
      expect(result.current.webSearch).toBe(mockToolToggleResponse);
      expect(result.current.codeInterpreter).toBe(mockToolToggleResponse);
      expect(result.current.fileSearch).toBe(mockToolToggleResponse);
      expect(result.current.artifacts).toBe(mockToolToggleResponse);
    });

    it('should throw error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useBadgeRowContext());
      }).toThrow('useBadgeRowContext must be used within a BadgeRowProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Ephemeral Agent Initialization', () => {
    it('should initialize ephemeral agent state from localStorage on mount', async () => {
      const conversationId = 'test-convo-123';
      const key = conversationId;

      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`, 'false');
      localStorage.setItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${key}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${key}`, 'true');

      const { result } = renderHook(
        () => {
          const context = useBadgeRowContext();
          const [agent] = useRecoilState(ephemeralAgentByConvoId(key));
          return { context, agent };
        },
        {
          wrapper: createWrapper({ conversationId }),
        },
      );

      await waitFor(() => {
        expect(result.current.agent).toEqual({
          [Tools.execute_code]: true,
          [Tools.web_search]: false,
          [Tools.file_search]: true,
          [AgentCapabilities.artifacts]: true,
        });
      });
    });

    it('should use default values when localStorage is empty', async () => {
      const conversationId = 'test-convo-456';
      const key = conversationId;

      const { result } = renderHook(
        () => {
          const context = useBadgeRowContext();
          const [agent] = useRecoilState(ephemeralAgentByConvoId(key));
          return { context, agent };
        },
        {
          wrapper: createWrapper({ conversationId }),
        },
      );

      await waitFor(() => {
        expect(result.current.agent).toEqual({
          [Tools.execute_code]: false,
          [Tools.web_search]: false,
          [Tools.file_search]: false,
          [AgentCapabilities.artifacts]: false,
        });
      });
    });

    it('should handle new conversation key', async () => {
      const key = Constants.NEW_CONVO;

      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${key}`, 'true');

      const { result } = renderHook(
        () => {
          const context = useBadgeRowContext();
          const [agent] = useRecoilState(ephemeralAgentByConvoId(key));
          return { context, agent };
        },
        {
          wrapper: createWrapper({ conversationId: null as any }),
        },
      );

      await waitFor(() => {
        expect(result.current.agent).toEqual({
          [Tools.execute_code]: true,
          [Tools.web_search]: false,
          [Tools.file_search]: false,
          [AgentCapabilities.artifacts]: true,
        });
      });
    });

    it('should not reinitialize when isSubmitting is true', () => {
      const conversationId = 'test-convo-789';
      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${conversationId}`, 'true');

      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId, isSubmitting: false }),
      });

      jest.clearAllMocks();

      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId, isSubmitting: true }),
      });

      expect(hooks.useToolToggle as jest.Mock).toHaveBeenCalledTimes(4);
    });

    it('should reinitialize when conversation changes', async () => {
      const firstConvoId = 'convo-1';
      const secondConvoId = 'convo-2';

      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${firstConvoId}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${secondConvoId}`, 'false');

      const { rerender } = renderHook(() => useBadgeRowContext(), {
        wrapper: ({ children }) => {
          const Wrapper = createWrapper({ conversationId: firstConvoId });
          return <Wrapper>{children}</Wrapper>;
        },
        initialProps: { conversationId: firstConvoId },
      });

      expect(hooks.useMCPSelect as jest.Mock).toHaveBeenCalledWith({
        conversationId: firstConvoId,
      });

      rerender({ conversationId: secondConvoId });
    });
  });

  describe('Tool Toggle Integration', () => {
    it('should configure code interpreter with correct parameters', () => {
      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId: 'test-convo' }),
      });

      expect(hooks.useToolToggle).toHaveBeenCalledWith({
        conversationId: 'test-convo',
        setIsDialogOpen: mockSetIsDialogOpen,
        toolKey: Tools.execute_code,
        localStorageKey: LocalStorageKeys.LAST_CODE_TOGGLE_,
        authConfig: {
          toolId: Tools.execute_code,
          queryOptions: { retry: 1 },
        },
      });
    });

    it('should configure web search with correct parameters', () => {
      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId: 'test-convo' }),
      });

      expect(hooks.useToolToggle).toHaveBeenCalledWith({
        conversationId: 'test-convo',
        toolKey: Tools.web_search,
        localStorageKey: LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_,
        setIsDialogOpen: mockSetIsDialogOpen,
        authConfig: {
          toolId: Tools.web_search,
          queryOptions: { retry: 1 },
        },
      });
    });

    it('should configure file search with correct parameters', () => {
      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId: 'test-convo' }),
      });

      expect(hooks.useToolToggle).toHaveBeenCalledWith({
        conversationId: 'test-convo',
        toolKey: Tools.file_search,
        localStorageKey: LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_,
        isAuthenticated: true,
      });
    });

    it('should configure artifacts with correct parameters', () => {
      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId: 'test-convo' }),
      });

      expect(hooks.useToolToggle).toHaveBeenCalledWith({
        conversationId: 'test-convo',
        toolKey: AgentCapabilities.artifacts,
        localStorageKey: LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_,
        isAuthenticated: true,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle corrupted localStorage data gracefully', async () => {
      const conversationId = 'test-convo-corrupt';
      const key = conversationId;

      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`, 'not-valid-json');
      localStorage.setItem(`${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`, '{invalid json}');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(
        () => {
          const context = useBadgeRowContext();
          const [agent] = useRecoilState(ephemeralAgentByConvoId(key));
          return { context, agent };
        },
        {
          wrapper: createWrapper({ conversationId }),
        },
      );

      await waitFor(() => {
        expect(result.current.agent).toEqual({
          [Tools.execute_code]: false,
          [Tools.web_search]: false,
          [Tools.file_search]: false,
          [AgentCapabilities.artifacts]: false,
        });
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse code toggle value:',
        expect.any(Error),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse web search toggle value:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should override ephemeral agent properties from localStorage', async () => {
      const conversationId = 'test-convo-preserve';
      const key = conversationId;

      localStorage.setItem(`${LocalStorageKeys.LAST_CODE_TOGGLE_}${key}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_WEB_SEARCH_TOGGLE_}${key}`, 'true');
      localStorage.setItem(`${LocalStorageKeys.LAST_FILE_SEARCH_TOGGLE_}${key}`, 'false');
      localStorage.setItem(`${LocalStorageKeys.LAST_ARTIFACTS_TOGGLE_}${key}`, 'false');

      const { result } = renderHook(
        () => {
          const context = useBadgeRowContext();
          const [agent] = useRecoilState(ephemeralAgentByConvoId(key));
          return { context, agent };
        },
        {
          wrapper: createWrapper({ conversationId }),
        },
      );

      await waitFor(() => {
        expect(result.current.agent).toEqual({
          [Tools.execute_code]: true,
          [Tools.web_search]: true,
          [Tools.file_search]: false,
          [AgentCapabilities.artifacts]: false,
        });
      });
    });

    it('should handle rapid conversation changes', () => {
      const conversations = ['convo-1', 'convo-2', 'convo-3'];

      conversations.forEach((convoId, index) => {
        localStorage.setItem(
          `${LocalStorageKeys.LAST_CODE_TOGGLE_}${convoId}`,
          String(index % 2 === 0),
        );
      });

      let currentConversationId = conversations[0];

      const { rerender } = renderHook(() => useBadgeRowContext(), {
        wrapper: ({ children }) => {
          const Wrapper = createWrapper({ conversationId: currentConversationId });
          return <Wrapper>{children}</Wrapper>;
        },
      });

      conversations.slice(1).forEach((convoId) => {
        act(() => {
          currentConversationId = convoId;
          rerender();
        });
      });

      expect(hooks.useMCPSelect as jest.Mock).toHaveBeenCalledTimes(conversations.length);
    });

    it('should handle null conversationId', () => {
      jest.clearAllMocks();

      renderHook(() => useBadgeRowContext(), {
        wrapper: createWrapper({ conversationId: null as any }),
      });

      expect(hooks.useMCPSelect).toHaveBeenCalledWith({ conversationId: null });
    });
  });
});
