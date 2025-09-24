/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Agent } from 'librechat-data-provider';

// Mock toast context - define this after all mocks
let mockShowToast: jest.Mock;

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
      chatGPTBrowser: 'chatGPTBrowser',
      gptPlugins: 'gptPlugins',
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
  useGetModelsQuery: () => ({ data: {} }),
  useGetEffectivePermissionsQuery: () => ({
    data: { permissionBits: 0xffffffff }, // All permissions
    isLoading: false,
  }),
  hasPermissions: (_bits: number, _required: number) => true, // Always return true for tests
}));

jest.mock('~/utils', () => ({
  createProviderOption: jest.fn((provider: string) => ({ value: provider, label: provider })),
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
  useAgentPanelContext: () => ({
    activePanel: 'builder',
    agentsConfig: { allowedProviders: [] },
    setActivePanel: jest.fn(),
    endpointsConfig: {},
    setCurrentAgentId: jest.fn(),
    agent_id: 'agent-123',
  }),
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
  default: () => <div>{`Model Panel`}</div>,
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
        },
      });

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
    useWatch: () => 'agent-123',
  };
});

// Import after mocks
import { dataService } from 'librechat-data-provider';
import { useGetAgentByIdQuery } from '~/data-provider';
import AgentPanel from './AgentPanel';

// Mock useGetAgentByIdQuery
jest.mock('~/data-provider', () => {
  const actual = jest.requireActual('~/data-provider') as any;
  return {
    ...actual,
    useGetAgentByIdQuery: jest.fn(),
    useGetExpandedAgentByIdQuery: jest.fn(() => ({
      data: null,
      isInitialLoading: false,
    })),
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
  mockUseGetAgentByIdQuery.mockReturnValue({
    data: {
      id: 'agent-123',
      author: 'user-123',
      isCollaborative: false,
      ...agent,
    } as Agent,
    isInitialLoading: false,
  } as any);
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
  });

  describe('AgentPanel', () => {
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
          message: 'com_assistants_update_success Test Agent',
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
          message: 'com_assistants_update_success com_ui_agent',
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
          message: 'com_assistants_update_success Test Agent',
        });
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
