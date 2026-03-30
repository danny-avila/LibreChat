import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import GroupForm from '../GroupForm';

// Mock hooks
const mockNavigate = jest.fn();
const mockUseParams = jest.fn();
const mockCreateMutation = {
  mutateAsync: jest.fn(),
  isPending: false,
};
const mockUpdateMutation = {
  mutateAsync: jest.fn(),
  isPending: false,
};
const mockDeleteMutation = {
  mutateAsync: jest.fn(),
  isPending: false,
};
const mockGetGroupQuery = {
  data: null,
  isLoading: false,
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
}));

jest.mock('../hooks', () => ({
  useCreateGroupMutation: () => mockCreateMutation,
  useUpdateGroupMutation: () => mockUpdateMutation,
  useDeleteGroupMutation: () => mockDeleteMutation,
  useGetGroupQuery: () => mockGetGroupQuery,
}));

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {component}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('GroupForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({});
  });

  test('renders create group form correctly', () => {
    renderWithProviders(<GroupForm />);

    expect(screen.getByText('Create New Group')).toBeDefined();
    expect(screen.getByLabelText(/Group Name/)).toBeDefined();
    expect(screen.getByLabelText(/Description/)).toBeDefined();
    expect(screen.getByText('Group Active')).toBeDefined();
    expect(screen.getByRole('button', { name: /Create Group/ })).toBeDefined();
  });

  test('shows validation error for empty name', async () => {
    renderWithProviders(<GroupForm />);

    const submitButton = screen.getByRole('button', { name: /Create Group/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Group name is required')).toBeDefined();
    });
  });

  test('shows validation error for name too long', async () => {
    renderWithProviders(<GroupForm />);

    const nameInput = screen.getByLabelText(/Group Name/);
    const longName = 'A'.repeat(101);
    
    fireEvent.change(nameInput, { target: { value: longName } });
    
    const submitButton = screen.getByRole('button', { name: /Create Group/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Group name must be less than 100 characters')).toBeDefined();
    });
  });

  test('shows validation error for description too long', async () => {
    renderWithProviders(<GroupForm />);

    const nameInput = screen.getByLabelText(/Group Name/);
    const descriptionInput = screen.getByLabelText(/Description/);
    
    fireEvent.change(nameInput, { target: { value: 'Valid Name' } });
    fireEvent.change(descriptionInput, { target: { value: 'B'.repeat(501) } });
    
    const submitButton = screen.getByRole('button', { name: /Create Group/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Description must be less than 500 characters')).toBeDefined();
    });
  });

  test('successfully creates a group', async () => {
    mockCreateMutation.mutateAsync.mockResolvedValue({
      success: true,
      message: 'Group created successfully',
      data: { _id: '123', name: 'Test Group' }
    });

    renderWithProviders(<GroupForm />);

    const nameInput = screen.getByLabelText(/Group Name/);
    const descriptionInput = screen.getByLabelText(/Description/);
    
    fireEvent.change(nameInput, { target: { value: 'Test Group' } });
    fireEvent.change(descriptionInput, { target: { value: 'Test description' } });
    
    const submitButton = screen.getByRole('button', { name: /Create Group/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockCreateMutation.mutateAsync).toHaveBeenCalledWith({
        name: 'Test Group',
        description: 'Test description',
        isActive: true,
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/d/groups');
    });
  });

  test('toggles active status correctly', () => {
    renderWithProviders(<GroupForm />);

    const toggleButton = screen.getByText('Group Active').closest('button');
    expect(toggleButton).toBeDefined();

    // Initially should be active (true)
    expect(screen.getByText('This group is active and can be used')).toBeDefined();

    // Click to toggle
    fireEvent.click(toggleButton!);

    // Should now be inactive
    expect(screen.getByText('This group is disabled')).toBeDefined();
  });

  test('renders edit form when groupId is provided', () => {
    mockUseParams.mockReturnValue({ groupId: '123' });
    mockGetGroupQuery.data = {
      success: true,
      data: {
        _id: '123',
        name: 'Existing Group',
        description: 'Existing description',
        isActive: false,
        memberCount: 5,
        timeWindows: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    };

    renderWithProviders(<GroupForm />);

    expect(screen.getByText('Edit Group')).toBeDefined();
    expect(screen.getByDisplayValue('Existing Group')).toBeDefined();
    expect(screen.getByDisplayValue('Existing description')).toBeDefined();
    expect(screen.getByRole('button', { name: /Update Group/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDefined();
  });

  test('updates group successfully', async () => {
    mockUseParams.mockReturnValue({ groupId: '123' });
    mockGetGroupQuery.data = {
      success: true,
      data: {
        _id: '123',
        name: 'Existing Group',
        description: 'Existing description',
        isActive: true,
        memberCount: 5,
        timeWindows: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    };

    mockUpdateMutation.mutateAsync.mockResolvedValue({
      success: true,
      message: 'Group updated successfully',
      data: { _id: '123', name: 'Updated Group' }
    });

    renderWithProviders(<GroupForm />);

    const nameInput = screen.getByDisplayValue('Existing Group');
    fireEvent.change(nameInput, { target: { value: 'Updated Group' } });
    
    const submitButton = screen.getByRole('button', { name: /Update Group/ });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
        groupId: '123',
        data: {
          name: 'Updated Group',
          description: 'Existing description',
          isActive: true,
        },
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/d/groups');
    });
  });

  test('handles delete group with confirmation', async () => {
    // Mock window.confirm
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);

    mockUseParams.mockReturnValue({ groupId: '123' });
    mockGetGroupQuery.data = {
      success: true,
      data: {
        _id: '123',
        name: 'Group to Delete',
        description: 'Will be deleted',
        isActive: true,
        memberCount: 0,
        timeWindows: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    };

    mockDeleteMutation.mutateAsync.mockResolvedValue({
      success: true,
      message: 'Group deleted successfully'
    });

    renderWithProviders(<GroupForm />);

    const deleteButton = screen.getByRole('button', { name: /Delete/ });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this group? This action cannot be undone.');
    });

    await waitFor(() => {
      expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledWith('123');
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/d/groups');
    });

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  test('cancels delete when user clicks cancel', async () => {
    // Mock window.confirm to return false
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => false);

    mockUseParams.mockReturnValue({ groupId: '123' });
    mockGetGroupQuery.data = {
      success: true,
      data: {
        _id: '123',
        name: 'Group to Delete',
        description: 'Will be deleted',
        isActive: true,
        memberCount: 0,
        timeWindows: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }
    };

    renderWithProviders(<GroupForm />);

    const deleteButton = screen.getByRole('button', { name: /Delete/ });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });

    // Should not call delete mutation
    expect(mockDeleteMutation.mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  test('shows loading state when group is being loaded', () => {
    mockUseParams.mockReturnValue({ groupId: '123' });
    mockGetGroupQuery.isLoading = true;

    renderWithProviders(<GroupForm />);

    expect(screen.getByText('Loading group...')).toBeDefined();
  });

  test('navigates back when Back button is clicked', () => {
    renderWithProviders(<GroupForm />);

    const backButton = screen.getByRole('button', { name: /Back/ });
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/d/groups');
  });

  test('navigates back when Cancel button is clicked', () => {
    renderWithProviders(<GroupForm />);

    const cancelButton = screen.getByRole('button', { name: /Cancel/ });
    fireEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/d/groups');
  });
});