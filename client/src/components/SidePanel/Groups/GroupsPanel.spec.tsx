import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, fireEvent, waitFor } from 'test/layout-test-utils';
import GroupsPanel from './GroupsPanel';

const mockCreateMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockAddMemberMutate = jest.fn();
const mockRemoveMemberMutate = jest.fn();
const mockGroupsQueryResult: {
  current: { groups: Array<{ _id: string; name: string; description?: string }> };
} = { current: { groups: [] } };

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useAdminGroupsQuery: () => ({ data: mockGroupsQueryResult.current, isLoading: false }),
  useAdminGroupMembersQuery: () => ({ data: { members: [] }, isLoading: false }),
  useSearchAdminUsersQuery: () => ({ data: [], isLoading: false }),
  useCreateAdminGroupMutation: (options: { onSuccess?: () => void }) => ({
    mutate: (vars: unknown) => {
      mockCreateMutate(vars);
      options?.onSuccess?.();
    },
    isLoading: false,
  }),
  useDeleteAdminGroupMutation: () => ({ mutate: mockDeleteMutate, isLoading: false }),
  useAddAdminGroupMemberMutation: () => ({ mutate: mockAddMemberMutate, isLoading: false }),
  useRemoveAdminGroupMemberMutation: () => ({ mutate: mockRemoveMemberMutate, isLoading: false }),
}));

describe('GroupsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupsQueryResult.current = { groups: [] };
  });

  it('renders the manage trigger and opens the dialog', async () => {
    const { getByText } = render(<GroupsPanel />);
    fireEvent.click(getByText('Manage'));
    await waitFor(() => expect(getByText('No groups yet')).toBeInTheDocument());
  });

  it('lists existing groups once opened', async () => {
    mockGroupsQueryResult.current = {
      groups: [{ _id: 'g1', name: 'Engineering', description: 'Eng team' }],
    };
    const { getByText } = render(<GroupsPanel />);
    fireEvent.click(getByText('Manage'));
    await waitFor(() => expect(getByText('Engineering')).toBeInTheDocument());
    expect(getByText('Eng team')).toBeInTheDocument();
  });

  it('creates a group with the entered name and description', async () => {
    const { getByText, getByPlaceholderText } = render(<GroupsPanel />);
    fireEvent.click(getByText('Manage'));
    await waitFor(() => expect(getByText('No groups yet')).toBeInTheDocument());

    fireEvent.change(getByPlaceholderText('Group name'), { target: { value: 'Sales' } });
    fireEvent.change(getByPlaceholderText('Description (optional)'), {
      target: { value: 'Sales team' },
    });
    fireEvent.click(getByText('Create group'));

    expect(mockCreateMutate).toHaveBeenCalledWith({ name: 'Sales', description: 'Sales team' });
  });

  it('disables group creation until a name is entered', async () => {
    const { getByText } = render(<GroupsPanel />);
    fireEvent.click(getByText('Manage'));
    await waitFor(() => expect(getByText('No groups yet')).toBeInTheDocument());

    const createButton = getByText('Create group').closest('button');
    expect(createButton).toBeDisabled();
  });
});
