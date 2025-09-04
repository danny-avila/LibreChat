import React from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { UseMutationResult } from '@tanstack/react-query';
import '@testing-library/jest-dom/extend-expect';
import type { Agent, AgentCreateParams, TUser, ResourceType } from 'librechat-data-provider';
import AgentFooter from '../AgentFooter';
import { Panel } from '~/common';

const mockUseWatch = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseHasAccess = jest.fn();
const mockUseResourcePermissions = jest.fn();

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
  }),
  useWatch: (params) => mockUseWatch(params),
}));

// Default mock implementations
mockUseWatch.mockImplementation(({ name }) => {
  if (name === 'agent') {
    return {
      _id: 'agent-db-123',
      name: 'Test Agent',
      author: 'user-123',
      projectIds: ['project-1'],
      isCollaborative: false,
    };
  }
  if (name === 'id') {
    return 'agent-123';
  }
  return undefined;
});

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

// Default auth context
mockUseAuthContext.mockReturnValue({
  user: mockUser,
  token: 'mock-token',
  isAuthenticated: true,
  error: undefined,
  login: jest.fn(),
  logout: jest.fn(),
  setError: jest.fn(),
  roles: {},
});

// Default access and permissions
mockUseHasAccess.mockReturnValue(true);
mockUseResourcePermissions.mockReturnValue({
  hasPermission: () => true,
  isLoading: false,
  permissionBits: 0,
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key) => {
    const translations = {
      com_ui_save: 'Save',
      com_ui_create: 'Create',
    };
    return translations[key] || key;
  },
  useAuthContext: () => mockUseAuthContext(),
  useHasAccess: () => mockUseHasAccess(),
  useResourcePermissions: () => mockUseResourcePermissions(),
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
  default: ({ agent_id }: { agent_id: string }) => (
    <button data-testid="delete-button" data-agent-id={agent_id} title="Delete Agent" />
  ),
}));

jest.mock('../DuplicateAgent', () => ({
  __esModule: true,
  default: ({ agent_id }: { agent_id: string }) => (
    <button data-testid="duplicate-button" data-agent-id={agent_id} title="Duplicate Agent" />
  ),
}));

jest.mock('~/components', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock('~/components/Sharing', () => ({
  GenericGrantAccessDialog: ({
    resourceDbId,
    resourceId,
    resourceName,
    resourceType,
  }: {
    resourceDbId: string;
    resourceId: string;
    resourceName: string;
    resourceType: ResourceType;
  }) => (
    <div
      data-testid="grant-access-dialog"
      data-resource-db-id={resourceDbId}
      data-resource-id={resourceId}
      data-resource-name={resourceName}
      data-resource-type={resourceType}
    />
  ),
}));

describe('AgentFooter', () => {
  const mockUsers = {
    regular: mockUser,
    admin: {
      ...mockUser,
      id: 'admin-123',
      username: 'admin',
      email: 'admin@example.com',
      name: 'Admin User',
      role: SystemRoles.ADMIN,
    } as TUser,
    different: {
      ...mockUser,
      id: 'different-user',
      username: 'different',
      email: 'different@example.com',
      name: 'Different User',
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

  const mockSetActivePanel = jest.fn();
  const mockSetCurrentAgentId = jest.fn();
  const mockCreateMutation = createBaseMutation<Agent, AgentCreateParams>();
  const mockUpdateMutation = createBaseMutation<Agent, any>();

  const defaultProps = {
    activePanel: Panel.builder,
    createMutation: mockCreateMutation,
    updateMutation: mockUpdateMutation,
    setActivePanel: mockSetActivePanel,
    setCurrentAgentId: mockSetCurrentAgentId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default mock implementations
    mockUseWatch.mockImplementation(({ name }) => {
      if (name === 'agent') {
        return {
          _id: 'agent-db-123',
          name: 'Test Agent',
          author: 'user-123',
          projectIds: ['project-1'],
          isCollaborative: false,
        };
      }
      if (name === 'id') {
        return 'agent-123';
      }
      return undefined;
    });
    // Reset auth context to default user
    mockUseAuthContext.mockReturnValue({
      user: mockUser,
      token: 'mock-token',
      isAuthenticated: true,
      error: undefined,
      login: jest.fn(),
      logout: jest.fn(),
      setError: jest.fn(),
      roles: {},
    });
    // Reset access and permissions to defaults
    mockUseHasAccess.mockReturnValue(true);
    mockUseResourcePermissions.mockReturnValue({
      hasPermission: () => true,
      isLoading: false,
      permissionBits: 0,
    });
  });

  describe('Main Functionality', () => {
    test('renders with standard components based on default state', () => {
      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByTestId('advanced-button')).toBeInTheDocument();
      expect(screen.getByTestId('version-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-button')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-settings')).not.toBeInTheDocument();
      expect(screen.getByTestId('grant-access-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('duplicate-button')).toBeInTheDocument();
      expect(document.querySelector('.spinner')).not.toBeInTheDocument();
    });

    test('handles loading states for createMutation', () => {
      const { unmount } = render(
        <AgentFooter {...defaultProps} createMutation={createBaseMutation(true)} />,
      );
      expect(document.querySelector('.spinner')).toBeInTheDocument();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
      // Find the submit button (the one with aria-busy attribute)
      const buttons = screen.getAllByRole('button');
      const submitButton = buttons.find((button) => button.getAttribute('type') === 'submit');
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute('aria-busy', 'true');
      unmount();
    });

    test('handles loading states for updateMutation', () => {
      render(<AgentFooter {...defaultProps} updateMutation={createBaseMutation(true)} />);
      expect(document.querySelector('.spinner')).toBeInTheDocument();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
    });
  });

  describe('Conditional Rendering', () => {
    test('adjusts UI based on activePanel state', () => {
      render(<AgentFooter {...defaultProps} activePanel={Panel.advanced} />);
      expect(screen.queryByTestId('advanced-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('version-button')).not.toBeInTheDocument();
    });

    test('adjusts UI based on agent ID existence', () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'agent') {
          return null; // No agent means no delete/share/duplicate buttons
        }
        if (name === 'id') {
          return undefined; // No ID means create mode
        }
        return undefined;
      });

      // When there's no agent, permissions should also return false
      mockUseResourcePermissions.mockReturnValue({
        hasPermission: () => false,
        isLoading: false,
        permissionBits: 0,
      });

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.queryByTestId('version-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('grant-access-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument();
    });

    test('adjusts UI based on user role', () => {
      mockUseAuthContext.mockReturnValue(createAuthContext(mockUsers.admin));
      const { unmount } = render(<AgentFooter {...defaultProps} />);
      expect(screen.getByTestId('admin-settings')).toBeInTheDocument();
      expect(screen.getByTestId('grant-access-dialog')).toBeInTheDocument();

      // Clean up the first render
      unmount();

      jest.clearAllMocks();
      mockUseAuthContext.mockReturnValue(createAuthContext(mockUsers.different));
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'agent') {
          return { name: 'Test Agent', author: 'different-author', _id: 'agent-123' };
        }
        if (name === 'id') {
          return 'agent-123';
        }
        return undefined;
      });
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('grant-access-dialog')).toBeInTheDocument(); // Still shows because hasAccess is true
      expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument(); // Should not show for different author
    });

    test('adjusts UI based on permissions', () => {
      mockUseHasAccess.mockReturnValue(false);
      // Also need to ensure the agent is not owned by the user and user is not admin
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'agent') {
          return {
            _id: 'agent-db-123',
            name: 'Test Agent',
            author: 'different-user', // Different author
            projectIds: ['project-1'],
            isCollaborative: false,
          };
        }
        if (name === 'id') {
          return 'agent-123';
        }
        return undefined;
      });
      // Mock permissions to not allow sharing
      mockUseResourcePermissions.mockReturnValue({
        hasPermission: () => false, // No permissions
        isLoading: false,
        permissionBits: 0,
      });
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('grant-access-dialog')).not.toBeInTheDocument();
    });

    test('hides action buttons when permissions are loading', () => {
      // Ensure we have an agent that would normally show buttons
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'agent') {
          return {
            _id: 'agent-db-123',
            name: 'Test Agent',
            author: 'user-123', // Same as current user
            projectIds: ['project-1'],
            isCollaborative: false,
          };
        }
        if (name === 'id') {
          return 'agent-123';
        }
        return undefined;
      });
      mockUseResourcePermissions.mockReturnValue({
        hasPermission: () => true,
        isLoading: true, // This should hide the buttons
        permissionBits: 0,
      });
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('grant-access-dialog')).not.toBeInTheDocument();
      // Duplicate button should still show as it doesn't depend on permissions loading
      expect(screen.getByTestId('duplicate-button')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles null agent data', () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'agent') {
          return null;
        }
        if (name === 'id') {
          return 'agent-123';
        }
        return undefined;
      });

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });
});
