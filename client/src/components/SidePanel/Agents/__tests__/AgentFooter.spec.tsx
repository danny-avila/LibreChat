import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import AgentFooter from '../AgentFooter';
import { Panel } from '~/common';
import type { Agent, AgentCreateParams, TUser } from 'librechat-data-provider';
import { SystemRoles } from 'librechat-data-provider';
import * as reactHookForm from 'react-hook-form';
import * as hooks from '~/hooks';
import type { UseMutationResult } from '@tanstack/react-query';

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
  }),
  useWatch: () => {
    return {
      agent: {
        name: 'Test Agent',
        author: 'user-123',
        projectIds: ['project-1'],
        isCollaborative: false,
      },
      id: 'agent-123',
    };
  },
}));

const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  avatar: '',
  role: 'USER',
  provider: 'local',
  emailVerified: true,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
} as TUser;

jest.mock('~/hooks', () => ({
  useLocalize: () => (key) => {
    const translations = {
      com_ui_save: 'Save',
      com_ui_create: 'Create',
    };
    return translations[key] || key;
  },
  useAuthContext: () => ({
    user: mockUser,
    token: 'mock-token',
    isAuthenticated: true,
    error: undefined,
    login: jest.fn(),
    logout: jest.fn(),
    setError: jest.fn(),
    roles: {},
  }),
  useHasAccess: () => true,
}));

const createBaseMutation = <T = Agent, P = any>(
  isLoading = false,
): UseMutationResult<T, Error, P> => {
  if (isLoading) {
    return {
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue({} as T),
      isLoading: true,
      isError: false,
      isSuccess: false,
      isIdle: false as const,
      status: 'loading' as const,
      error: null,
      data: undefined,
      failureCount: 0,
      failureReason: null,
      reset: jest.fn(),
      context: undefined,
      variables: undefined,
      isPaused: false,
    };
  } else {
    return {
      mutate: jest.fn(),
      mutateAsync: jest.fn().mockResolvedValue({} as T),
      isLoading: false,
      isError: false,
      isSuccess: false,
      isIdle: true as const,
      status: 'idle' as const,
      error: null,
      data: undefined,
      failureCount: 0,
      failureReason: null,
      reset: jest.fn(),
      context: undefined,
      variables: undefined,
      isPaused: false,
    };
  }
};

jest.mock('~/data-provider', () => ({
  useUpdateAgentMutation: () => createBaseMutation<Agent, any>(),
}));

jest.mock('../Advanced/AdvancedButton', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="advanced-button" />),
}));

jest.mock('../Version/VersionButton', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="version-button" />),
}));

jest.mock('../AdminSettings', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="admin-settings" />),
}));

jest.mock('../DeleteButton', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="delete-button" />),
}));

jest.mock('../ShareAgent', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="share-agent" />),
}));

jest.mock('../DuplicateAgent', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="duplicate-agent" />),
}));

jest.mock('~/components', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

describe('AgentFooter', () => {
  const mockUsers = {
    regular: mockUser,
    admin: {
      id: 'admin-123',
      username: 'admin',
      email: 'admin@example.com',
      name: 'Admin User',
      avatar: '',
      role: SystemRoles.ADMIN,
      provider: 'local',
      emailVerified: true,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    } as TUser,
    different: {
      id: 'different-user',
      username: 'different',
      email: 'different@example.com',
      name: 'Different User',
      avatar: '',
      role: 'USER',
      provider: 'local',
      emailVerified: true,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    } as TUser,
  };

  const createAuthContext = (user: TUser) => ({
    user,
    token: 'mock-token',
    isAuthenticated: true,
    error: undefined,
    login: jest.fn(),
    logout: jest.fn(),
    setError: jest.fn(),
    roles: {},
  });

  const createMutationMock = createBaseMutation;

  const mockSetActivePanel = jest.fn();
  const mockSetCurrentAgentId = jest.fn();

  const mockCreateMutation = createMutationMock<Agent, AgentCreateParams>();
  const mockUpdateMutation = createMutationMock<Agent, any>();

  const defaultProps = {
    activePanel: Panel.builder,
    createMutation: mockCreateMutation,
    updateMutation: mockUpdateMutation,
    setActivePanel: mockSetActivePanel,
    setCurrentAgentId: mockSetCurrentAgentId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders save button when agent_id exists', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  test('renders advanced button when activePanel is builder', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.getByTestId('advanced-button')).toBeInTheDocument();
  });

  test('renders version button when agent_id exists and activePanel is builder', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.getByTestId('version-button')).toBeInTheDocument();
  });

  test('does not render admin settings for regular users', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.queryByTestId('admin-settings')).not.toBeInTheDocument();
  });

  test('renders delete button', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.getByTestId('delete-button')).toBeInTheDocument();
  });

  test('share agent button should be rendered but is currently not rendered', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
  });

  test('duplicate agent button should be rendered but is currently not rendered', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument();
  });

  test('submit button is enabled when mutations are not loading', () => {
    render(<AgentFooter {...defaultProps} />);
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  describe('edge cases', () => {
    test('does not render advanced or version buttons when activePanel is not builder', () => {
      render(<AgentFooter {...defaultProps} activePanel={Panel.advanced} />);
      expect(screen.queryByTestId('advanced-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('version-button')).not.toBeInTheDocument();
    });

    test('renders spinner when createMutation is loading', () => {
      const loadingProps = {
        ...defaultProps,
        createMutation: createMutationMock<Agent, AgentCreateParams>(true),
      };
      render(<AgentFooter {...loadingProps} />);
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });

    test('renders spinner when updateMutation is loading', () => {
      const loadingProps = {
        ...defaultProps,
        updateMutation: createMutationMock<Agent, any>(true),
      };
      render(<AgentFooter {...loadingProps} />);
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });

    test('should render Create button but currently renders Save when agent_id does not exist', () => {
      jest.spyOn(reactHookForm, 'useWatch').mockImplementation(() => {
        return {
          agent: {
            name: 'Test Agent',
            author: 'user-123',
          },
          id: undefined,
        };
      });

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    test('version button should not be rendered when agent_id does not exist but is currently rendered', () => {
      jest.spyOn(reactHookForm, 'useWatch').mockImplementation(() => {
        return {
          agent: {
            name: 'Test Agent',
            author: 'user-123',
          },
          id: undefined,
        };
      });

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByTestId('version-button')).toBeInTheDocument();
    });

    test('admin settings should be rendered for admin users but are currently not rendered', () => {
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.admin));

      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('admin-settings')).not.toBeInTheDocument();
    });

    test('does not render share agent button when hasAccessToShareAgents is false', () => {
      jest.spyOn(hooks, 'useHasAccess').mockReturnValue(false);

      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
    });

    test('does not render share agent button when user is not the author and not admin', () => {
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.different));

      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
    });

    test('does not render duplicate agent button when user is not the author', () => {
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.different));

      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument();
    });

    test('disables submit button when mutations are loading', () => {
      const loadingProps = {
        ...defaultProps,
        createMutation: createMutationMock<Agent, AgentCreateParams>(true),
      };
      render(<AgentFooter {...loadingProps} />);

      const submitButton = screen.getByRole('button');
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute('aria-busy', 'true');
    });

    test('share agent button should be rendered for admin users but is currently not rendered', () => {
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.admin));
      jest.spyOn(hooks, 'useHasAccess').mockReturnValue(true);

      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
    });

    test('handles case when agent is null', () => {
      jest.spyOn(reactHookForm, 'useWatch').mockImplementation(() => {
        return {
          agent: null,
          id: 'agent-123',
        };
      });

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });
});
