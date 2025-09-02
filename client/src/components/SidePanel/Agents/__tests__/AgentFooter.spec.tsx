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
  });

  describe('Main Functionality', () => {
    test('renders with standard components based on default state', () => {
      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByTestId('advanced-button')).toBeInTheDocument();
      expect(screen.getByTestId('version-button')).toBeInTheDocument();
      expect(screen.getByTestId('delete-button')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-settings')).not.toBeInTheDocument();
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    });

    test('handles loading states for createMutation', () => {
      const { unmount } = render(
        <AgentFooter {...defaultProps} createMutation={createBaseMutation(true)} />,
      );
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByText('Save')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
      unmount();
    });

    test('handles loading states for updateMutation', () => {
      render(<AgentFooter {...defaultProps} updateMutation={createBaseMutation(true)} />);
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
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
      jest.spyOn(reactHookForm, 'useWatch').mockImplementation(() => ({
        agent: { name: 'Test Agent', author: 'user-123' },
        id: undefined,
      }));

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByTestId('version-button')).toBeInTheDocument();
    });

    test('adjusts UI based on user role', () => {
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.admin));
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('admin-settings')).not.toBeInTheDocument();
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();

      jest.clearAllMocks();
      jest.spyOn(hooks, 'useAuthContext').mockReturnValue(createAuthContext(mockUsers.different));
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('duplicate-agent')).not.toBeInTheDocument();
    });

    test('adjusts UI based on permissions', () => {
      jest.spyOn(hooks, 'useHasAccess').mockReturnValue(false);
      render(<AgentFooter {...defaultProps} />);
      expect(screen.queryByTestId('share-agent')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles null agent data', () => {
      jest.spyOn(reactHookForm, 'useWatch').mockImplementation(() => ({
        agent: null,
        id: 'agent-123',
      }));

      render(<AgentFooter {...defaultProps} />);
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });
});
