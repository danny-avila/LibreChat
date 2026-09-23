/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UseFormReturn } from 'react-hook-form';
import type { Agent } from 'librechat-data-provider';
import type { AgentForm, AgentModelPanelProps } from '~/common';

// Mock toast context - define this after all mocks
let mockShowToast: jest.Mock;
let mockModelsQuery: {
  data: Record<string, string[]>;
  isFetchedAfterMount: boolean;
  isSuccess: boolean;
  isFetching?: boolean;
} = { data: {}, isFetchedAfterMount: true, isSuccess: true };
let mockModelPanelProps: Pick<
  AgentModelPanelProps,
  'models' | 'modelsError' | 'modelsReady'
> | null = null;
let mockFormDefaults: Partial<AgentForm> = {};
let mockAgentPanelContext = {
  activePanel: 'builder',
  agentsConfig: { allowedProviders: [] as string[] },
  setActivePanel: jest.fn(),
  endpointsConfig: {},
  setCurrentAgentId: jest.fn(),
  agent_id: 'agent-123' as string | undefined,
};

// Mock notification severity enum before other imports
jest.mock('~/common/types', () => ({
  NotificationSeverity: {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning',
  },
}));

// Mock store to prevent import errors
jest.mock('~/store/toast', () => ({
  default: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('~/store', () => {});

// Mock the data service to control network responses
jest.mock('librechat-data-provider', () => {
  const actualModule = jest.requireActual('librechat-data-provider') as any;
  return {
    ...actualModule,
    dataService: {
      createAgent: jest.fn(),
      updateAgent: jest.fn(),
    },
    Tools: actualModule.Tools || {
      execute_code: 'execute_code',
      file_search: 'file_search',
      web_search: 'web_search',
    },
    Constants: actualModule.Constants || {
      EPHEMERAL_AGENT_ID: 'ephemeral',
    },
    SystemRoles: actualModule.SystemRoles || {
      ADMIN: 'ADMIN',
    },
    EModelEndpoint: actualModule.EModelEndpoint || {
      agents: 'agents',
    },
    ResourceType: actualModule.ResourceType || {
      AGENT: 'agent',
    },
    PermissionBits: actualModule.PermissionBits || {
      EDIT: 2,
    },
    isAssistantsEndpoint: jest.fn(() => false),
  };
});

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  useToastContext: () => ({
    get showToast() {
      return mockShowToast || jest.fn();
    },
  }),
}));

// Mock other dependencies
jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => mockModelsQuery,
  useGetEffectivePermissionsQuery: () => ({
    data: { permissionBits: 0xffffffff }, // All permissions
    isLoading: false,
  }),
  hasPermissions: (_bits: number, _required: number) => true, // Always return true for tests
}));

jest.mock('~/utils', () => ({
  createProviderOption: jest.fn((provider: string) => ({ value: provider, label: provider })),
  getAvailableAgentSelection: jest.requireActual('~/utils/agentModelSelection')
    .getAvailableAgentSelection,
  getDefaultAgentFormValues: jest.fn(() => ({
    id: '',
    name: '',
    description: '',
    model: '',
    provider: '',
  })),
}));

jest.mock('~/hooks', () => ({
  useSelectAgent: () => ({ onSelect: jest.fn() }),
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: { id: 'user-123', role: 'USER' } }),
}));

jest.mock('~/hooks/useResourcePermissions', () => ({
  useResourcePermissions: () => ({
    hasPermission: jest.fn(() => true),
    isLoading: false,
  }),
}));

jest.mock('~/Providers/AgentPanelContext', () => ({
  useAgentPanelContext: () => mockAgentPanelContext,
}));

jest.mock('~/common', () => ({
  isEphemeralAgent: (agentId: string | null | undefined): boolean => {
    return agentId == null || agentId === '' || agentId === 'ephemeral';
  },
  Panel: {
    model: 'model',
    builder: 'builder',
    advanced: 'advanced',
  },
}));

// Mock child components to simplify testing
jest.mock('./AgentPanelSkeleton', () => ({
  __esModule: true,
  default: () => <div>{`Loading...`}</div>,
}));

jest.mock('./Advanced/AdvancedPanel', () => ({
  __esModule: true,
  default: () => <div>{`Advanced Panel`}</div>,
}));

jest.mock('./AgentConfig', () => ({
  __esModule: true,
  default: () => <div>{`Agent Config`}</div>,
}));

jest.mock('./AgentSelect', () => ({
  __esModule: true,
  default: () => <div>{`Agent Select`}</div>,
}));

jest.mock('./ModelPanel', () => ({
  __esModule: true,
  default: (props: Pick<AgentModelPanelProps, 'models' | 'modelsError' | 'modelsReady'>) => {
    mockModelPanelProps = props;
    return <div>{`Model Panel`}</div>;
  },
}));

// Mock AgentFooter to provide a save button
jest.mock('./AgentFooter', () => ({
  __esModule: true,
  default: () => (
    <button type="submit" data-testid="save-agent-button">
      {`Save Agent`}
    </button>
  ),
}));

// Mock react-hook-form to capture form submission
let mockFormSubmitHandler: (() => void) | null = null;
let capturedFormMethods: UseFormReturn<AgentForm> | null = null;

jest.mock('react-hook-form', () => {
  const actual = jest.requireActual('react-hook-form') as any;
  return {
    ...actual,
    useForm: () => {
      const methods = actual.useForm({
        defaultValues: {
          id: 'agent-123',
          name: 'Test Agent',
          description: 'Test description',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          execute_code: false,
          file_search: false,
          web_search: false,
          ...mockFormDefaults,
        },
      });

      capturedFormMethods = methods;

      return {
        ...methods,
        handleSubmit: (onSubmit: any) => (e?: any) => {
          e?.preventDefault?.();
          mockFormSubmitHandler = () => onSubmit(methods.getValues());
          return mockFormSubmitHandler;
        },
      };
    },
    FormProvider: ({ children }: any) => children,
  };
});

// Import after mocks
import { dataService } from 'librechat-data-provider';
import { useGetAgentByIdQuery, useGetExpandedAgentByIdQuery } from '~/data-provider';
import AgentPanel from './AgentPanel';

// Mock useGetAgentByIdQuery
jest.mock('~/data-provider', () => {
  const actual = jest.requireActual('~/data-provider') as any;
  return {
    ...actual,
    useGetAgentByIdQuery: jest.fn(),
    useGetExpandedAgentByIdQuery: jest.fn(),
    useUpdateAgentMutation: actual.useUpdateAgentMutation,
  };
});

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

// Test helpers
const setupMocks = () => {
  const mockUseGetAgentByIdQuery = useGetAgentByIdQuery as jest.MockedFunction<
    typeof useGetAgentByIdQuery
  >;
  const mockUpdateAgent = dataService.updateAgent as jest.MockedFunction<
    typeof dataService.updateAgent
  >;

  return { mockUseGetAgentByIdQuery, mockUpdateAgent };
};

const mockAgentQuery = (
  mockUseGetAgentByIdQuery: jest.MockedFunction<typeof useGetAgentByIdQuery>,
  agent: Partial<Agent>,
) => {
  const data = {
    id: 'agent-123',
    author: 'user-123',
    /** Matches `createMockAgent`, so a field the submission carries but never edits
     *  compares equal across the update rather than reading as a change. */
    provider: 'openai',
    model: 'gpt-4',
    ...agent,
  } as Agent;

  mockUseGetAgentByIdQuery.mockReturnValue({ data, isInitialLoading: false } as any);
  /** The panel resolves to the expanded query once it has data, and only that projection
   *  carries every field the submission compares against. */
  (
    useGetExpandedAgentByIdQuery as jest.MockedFunction<typeof useGetExpandedAgentByIdQuery>
  ).mockReturnValue({ data, isInitialLoading: false } as any);
};

const createMockAgent = (overrides: Partial<Agent> = {}): Agent =>
  ({
    id: 'agent-123',
    provider: 'openai',
    model: 'gpt-4',
    ...overrides,
  }) as Agent;

const renderAndSubmitForm = async () => {
  const Wrapper = createWrapper();
  const { container, rerender } = render(<AgentPanel />, { wrapper: Wrapper });

  const form = container.querySelector('form');
  expect(form).toBeTruthy();

  fireEvent.submit(form!);

  if (mockFormSubmitHandler) {
    mockFormSubmitHandler();
  }

  return { container, rerender, form };
};

describe('AgentPanel - Update Agent Toast Messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowToast = jest.fn();
    mockFormSubmitHandler = null;
    capturedFormMethods = null;
    mockModelPanelProps = null;
    mockFormDefaults = {};
    mockModelsQuery = {
      data: { openai: ['gpt-4'] },
      isFetchedAfterMount: true,
      isSuccess: true,
    };
    mockAgentPanelContext = {
      activePanel: 'builder',
      agentsConfig: { allowedProviders: [] },
      setActivePanel: jest.fn(),
      endpointsConfig: { openai: {} },
      setCurrentAgentId: jest.fn(),
      agent_id: 'agent-123',
    };
    localStorage.clear();
  });

  describe('AgentPanel', () => {
    it('restores saved defaults from the current model catalogue', async () => {
      const { mockUseGetAgentByIdQuery } = setupMocks();
      mockAgentQuery(mockUseGetAgentByIdQuery, {});
      mockAgentPanelContext = {
        ...mockAgentPanelContext,
        endpointsConfig: { custom: {} },
        agent_id: undefined,
      };
      mockModelsQuery = {
        data: { custom: ['cached-model'] },
        isFetchedAfterMount: true,
        isSuccess: true,
        isFetching: true,
      };
      localStorage.setItem('lastAgentProvider', 'custom');
      localStorage.setItem('lastAgentModel', 'current-model');

      const Wrapper = createWrapper();
      const { rerender } = render(<AgentPanel />, { wrapper: Wrapper });

      mockModelsQuery = {
        data: { custom: ['current-model'] },
        isFetchedAfterMount: true,
        isSuccess: true,
        isFetching: false,
      };
      rerender(<AgentPanel />);

      await waitFor(() => {
        expect(capturedFormMethods?.getValues('provider')).toEqual({
          value: 'custom',
          label: 'custom',
        });
        expect(capturedFormMethods?.getValues('model')).toBe('current-model');
      });
    });

    it('clears unavailable saved defaults', async () => {
      const { mockUseGetAgentByIdQuery } = setupMocks();
      mockAgentQuery(mockUseGetAgentByIdQuery, {});
      mockAgentPanelContext = {
        ...mockAgentPanelContext,
        endpointsConfig: { custom: {} },
        agent_id: undefined,
      };
      mockModelsQuery = {
        data: { custom: ['current-model'] },
        isFetchedAfterMount: true,
        isSuccess: true,
      };
      localStorage.setItem('lastAgentProvider', 'custom');
      localStorage.setItem('lastAgentModel', 'removed-model');

      const Wrapper = createWrapper();
      render(<AgentPanel />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(capturedFormMethods?.getValues('provider')).toEqual({
          value: 'custom',
          label: 'custom',
        });
        expect(capturedFormMethods?.getValues('model')).toBe('');
      });
      expect(localStorage.getItem('lastAgentModel')).toBeNull();
    });

    it('withholds the seeded catalogue until the mounted fetch resolves', async () => {
      const { mockUseGetAgentByIdQuery } = setupMocks();
      mockAgentQuery(mockUseGetAgentByIdQuery, {});
      mockAgentPanelContext = { ...mockAgentPanelContext, activePanel: 'model' };
      mockModelsQuery = {
        data: { openai: ['seeded-fallback-model'] },
        isFetchedAfterMount: false,
        isSuccess: true,
        isFetching: true,
      };

      const Wrapper = createWrapper();
      render(<AgentPanel />, { wrapper: Wrapper });

      await waitFor(() => expect(mockModelPanelProps).not.toBeNull());
      expect(mockModelPanelProps?.models).toEqual({});
      expect(mockModelPanelProps?.modelsReady).toBe(false);
      expect(mockModelPanelProps?.modelsError).toBe(false);
    });

    it('withholds the seeded catalogue when the models request fails', async () => {
      const { mockUseGetAgentByIdQuery } = setupMocks();
      mockAgentQuery(mockUseGetAgentByIdQuery, {});
      mockAgentPanelContext = { ...mockAgentPanelContext, activePanel: 'model' };
      mockModelsQuery = {
        data: { openai: ['seeded-fallback-model'] },
        isFetchedAfterMount: true,
        isSuccess: false,
        isFetching: false,
      };

      const Wrapper = createWrapper();
      render(<AgentPanel />, { wrapper: Wrapper });

      await waitFor(() => expect(mockModelPanelProps).not.toBeNull());
      expect(mockModelPanelProps?.models).toEqual({});
      expect(mockModelPanelProps?.modelsError).toBe(true);
    });

    it("preserves an existing agent's configured model", async () => {
      const { mockUseGetAgentByIdQuery } = setupMocks();
      mockAgentQuery(mockUseGetAgentByIdQuery, {});
      mockAgentPanelContext = {
        ...mockAgentPanelContext,
        endpointsConfig: { bedrock: {} },
      };
      mockModelsQuery = {
        data: { bedrock: ['current-model'] },
        isFetchedAfterMount: true,
        isSuccess: true,
      };

      const Wrapper = createWrapper();
      render(<AgentPanel />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(capturedFormMethods?.getValues('provider')).toBe('openai');
        expect(capturedFormMethods?.getValues('model')).toBe('gpt-4');
      });
    });

    it('should show "no changes" toast when version does not change', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      // Mock the agent query with version 2
      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 2,
      });

      // Mock network response - same version
      mockUpdateAgent.mockResolvedValue(createMockAgent({ name: 'Test Agent', version: 2 }));

      await renderAndSubmitForm();

      // Wait for the toast to be shown
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_ui_no_changes',
          status: 'info',
        });
      });
    });

    it('should show "update success" toast when an edited agent reuses the same version', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 2,
      });

      /** An update whose result matches the newest version is written without recording a
       *  version entry, so the count comes back unchanged even though the edit was saved. */
      mockUpdateAgent.mockResolvedValue(createMockAgent({ name: 'Renamed Agent', version: 2 }));

      const Wrapper = createWrapper();
      const { container } = render(<AgentPanel />, { wrapper: Wrapper });

      act(() => {
        capturedFormMethods!.setValue('name', 'Renamed Agent', { shouldDirty: true });
      });

      fireEvent.submit(container.querySelector('form')!);
      mockFormSubmitHandler?.();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_assistants_update_success_name',
          status: undefined,
        });
      });
      expect(mockShowToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'com_ui_no_changes' }),
      );
    });

    it('should show "update success" toast when an avatar reset reuses the same version', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 2,
        avatar: { filepath: '/images/agent-123/avatar.png', source: 'local' },
      });

      /** A reset rides the update payload as `avatar: null`, and clearing an avatar the
       *  newest version never recorded reads as a duplicate, so the count comes back
       *  unchanged even though the avatar was deleted. */
      mockUpdateAgent.mockResolvedValue(
        createMockAgent({ name: 'Test Agent', version: 2, avatar: null }),
      );

      const Wrapper = createWrapper();
      const { container } = render(<AgentPanel />, { wrapper: Wrapper });

      act(() => {
        capturedFormMethods!.setValue('avatar_action', 'reset', { shouldDirty: true });
      });

      fireEvent.submit(container.querySelector('form')!);
      mockFormSubmitHandler?.();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_assistants_update_success_name',
          status: undefined,
        });
      });
      expect(mockShowToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'com_ui_no_changes' }),
      );
    });

    it('should show "no changes" toast when the server drops the submitted edit', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 2,
        tools: ['keep'],
      });

      /** An MCP tool the user added can be stripped by authorization before the write, so
       *  a dirty submission is no promise that anything was persisted. */
      mockUpdateAgent.mockResolvedValue(
        createMockAgent({ name: 'Test Agent', version: 2, tools: ['keep'] }),
      );

      const Wrapper = createWrapper();
      const { container } = render(<AgentPanel />, { wrapper: Wrapper });

      act(() => {
        capturedFormMethods!.setValue('tools', ['keep', 'rejected_mcp_tool'], {
          shouldDirty: true,
        });
      });

      fireEvent.submit(container.querySelector('form')!);
      mockFormSubmitHandler?.();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_ui_no_changes',
          status: 'info',
        });
      });
    });

    it('should show "update success" toast when version changes', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      // Mock the agent query with version 2
      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 2,
      });

      // Mock network response - different version
      mockUpdateAgent.mockResolvedValue(createMockAgent({ name: 'Test Agent', version: 3 }));

      await renderAndSubmitForm();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_assistants_update_success_name',
          status: undefined,
        });
      });
    });

    it('should show "update success" with default name when agent has no name', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      // Mock the agent query without name
      mockAgentQuery(mockUseGetAgentByIdQuery, {
        version: 1,
      });

      // Mock network response - no name
      mockUpdateAgent.mockResolvedValue(createMockAgent({ version: 2 }));

      await renderAndSubmitForm();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_assistants_update_success_name',
          status: undefined,
        });
      });
    });

    it('should show "update success" when agent query has no version (undefined)', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      // Mock the agent query with no version data
      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        // No version property
      });

      mockUpdateAgent.mockResolvedValue(createMockAgent({ name: 'Test Agent', version: 1 }));

      await renderAndSubmitForm();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_assistants_update_success_name',
          status: undefined,
        });
      });
    });

    describe('agent creation', () => {
      /** Creation runs off the form's own `id`, and a provider/model the user picked keeps the
       *  saved-defaults reconciliation from rewriting the pair before it reaches submission. */
      const renderAndSubmitNewAgent = async () => {
        const Wrapper = createWrapper();
        const { container } = render(<AgentPanel />, { wrapper: Wrapper });

        await act(async () => {
          capturedFormMethods?.setValue('provider', 'openai', { shouldDirty: true });
          capturedFormMethods?.setValue('model', 'gpt-4', { shouldDirty: true });
        });

        fireEvent.submit(container.querySelector('form')!);
        if (mockFormSubmitHandler) {
          await act(async () => {
            mockFormSubmitHandler!();
          });
        }
      };

      beforeEach(() => {
        mockFormDefaults = { id: '' };
        mockAgentPanelContext = { ...mockAgentPanelContext, agent_id: undefined };
      });

      it('refuses to create an agent while the catalogue is unavailable', async () => {
        const { mockUseGetAgentByIdQuery } = setupMocks();
        mockAgentQuery(mockUseGetAgentByIdQuery, {});
        mockModelsQuery = {
          data: { openai: ['gpt-4'] },
          isFetchedAfterMount: true,
          isSuccess: false,
          isFetching: false,
        };

        await renderAndSubmitNewAgent();

        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'com_error_models_not_loaded' }),
        );
        expect(dataService.createAgent).not.toHaveBeenCalled();
      });

      it('refuses to create an agent with a model the catalogue no longer offers', async () => {
        const { mockUseGetAgentByIdQuery } = setupMocks();
        mockAgentQuery(mockUseGetAgentByIdQuery, {});
        mockModelsQuery = {
          data: { openai: ['gpt-4o'] },
          isFetchedAfterMount: true,
          isSuccess: true,
          isFetching: false,
        };

        await renderAndSubmitNewAgent();

        expect(mockShowToast).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'com_error_model_not_found' }),
        );
        expect(dataService.createAgent).not.toHaveBeenCalled();
      });

      it('creates the agent when the catalogue offers the selected model', async () => {
        const { mockUseGetAgentByIdQuery } = setupMocks();
        mockAgentQuery(mockUseGetAgentByIdQuery, {});
        (dataService.createAgent as jest.Mock).mockResolvedValue(createMockAgent());
        mockModelsQuery = {
          data: { openai: ['gpt-4'] },
          isFetchedAfterMount: true,
          isSuccess: true,
          isFetching: false,
        };

        await renderAndSubmitNewAgent();

        await waitFor(() =>
          expect(dataService.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4', provider: 'openai' }),
          ),
        );
      });
    });

    it('should show error toast on update failure', async () => {
      const { mockUseGetAgentByIdQuery, mockUpdateAgent } = setupMocks();

      // Mock the agent query
      mockAgentQuery(mockUseGetAgentByIdQuery, {
        name: 'Test Agent',
        version: 1,
      });

      // Mock network error
      mockUpdateAgent.mockRejectedValue(new Error('Update failed'));

      await renderAndSubmitForm();

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          message: 'com_agents_update_error com_ui_error: Update failed',
          status: 'error',
        });
      });
    });
  });
});
