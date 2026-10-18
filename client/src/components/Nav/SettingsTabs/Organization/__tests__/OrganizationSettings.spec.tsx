import userEvent from '@testing-library/user-event';
import { act, render, screen, within } from '@testing-library/react';
import OrganizationMembers from '../OrganizationMembers';
import OrganizationInvites from '../OrganizationInvites';

const mockUpdateMutate = jest.fn();
const mockDeactivateMutate = jest.fn();
const mockCreateMutate = jest.fn();
const mockRevokeMutate = jest.fn();
const mockResendMutate = jest.fn();
const mockCreateOptions: { current?: { onSuccess?: (data: unknown) => void } } = {};
const mockMembersState: { current: Record<string, unknown> } = { current: {} };
const mockInvitesState: { current: Record<string, unknown> } = { current: {} };

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({
    data: { organizations: { enabled: true, allowLinkInvites: true } },
  }),
  useOrganizationMembersInfiniteQuery: () => mockMembersState.current,
  useUpdateOrganizationMemberMutation: () => ({ mutate: mockUpdateMutate, isLoading: false }),
  useDeactivateOrganizationMemberMutation: () => ({
    mutate: mockDeactivateMutate,
    isLoading: false,
  }),
  useOrganizationInvitesQuery: () => mockInvitesState.current,
  useCreateOrganizationInviteMutation: (options: { onSuccess?: (data: unknown) => void }) => {
    mockCreateOptions.current = options;
    return { mutate: mockCreateMutate, isLoading: false };
  },
  useRevokeOrganizationInviteMutation: () => ({ mutate: mockRevokeMutate, isLoading: false }),
  useResendOrganizationInviteMutation: () => ({ mutate: mockResendMutate, isLoading: false }),
}));

jest.mock('../../../Settings/context', () => ({
  useSettingsContext: () => ({ isOrganizationAdmin: true }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'member-alice' } }),
  useLocalize: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
  useOrganizationErrorMessage: () => () => 'organization error',
}));

const members = [
  {
    id: 'member-alice',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'ADMIN',
    status: 'active',
  },
  { id: 'member-bob', name: 'Bob', email: 'bob@example.com', role: 'USER', status: 'active' },
  { id: 'member-eve', name: 'Eve', email: 'eve@example.com', role: 'USER', status: 'deactivated' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockMembersState.current = {
    data: { pages: [{ members }] },
    isLoading: false,
    isFetching: false,
    hasNextPage: false,
  };
  mockInvitesState.current = { data: { invites: [] }, isLoading: false };
});

describe('OrganizationMembers', () => {
  it('lists members, never offering to remove yourself, and removes another after confirming', async () => {
    const user = userEvent.setup();
    render(<OrganizationMembers />);
    await user.click(screen.getByRole('button', { name: 'com_ui_org_members' }));

    const dialog = await screen.findByRole('dialog');
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('com_ui_org_member_you')).toBeInTheDocument();
    expect(within(rows[0]).queryByRole('button', { name: 'com_ui_org_member_remove' })).toBeNull();
    expect(within(rows[2]).getByText('com_ui_org_member_deactivated')).toBeInTheDocument();

    await user.click(within(rows[1]).getByRole('button', { name: 'com_ui_org_member_remove' }));
    expect(mockDeactivateMutate).not.toHaveBeenCalled();
    await user.click(
      within(rows[1]).getByRole('button', { name: /com_ui_org_member_remove_confirm/ }),
    );
    expect(mockDeactivateMutate).toHaveBeenCalledWith('member-bob');
  });

  it('shows an empty organization search', async () => {
    mockMembersState.current = { ...mockMembersState.current, data: { pages: [{ members: [] }] } };
    const user = userEvent.setup();
    render(<OrganizationMembers />);
    await user.click(screen.getByRole('button', { name: 'com_ui_org_members' }));

    expect(await screen.findByText('com_ui_org_members_empty')).toBeInTheDocument();
  });

  it('loads further pages on demand', async () => {
    const fetchNextPage = jest.fn();
    mockMembersState.current = { ...mockMembersState.current, hasNextPage: true, fetchNextPage };
    const user = userEvent.setup();
    render(<OrganizationMembers />);
    await user.click(screen.getByRole('button', { name: 'com_ui_org_members' }));

    await user.click(await screen.findByRole('button', { name: 'com_ui_load_more' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });
});

describe('OrganizationInvites', () => {
  it('invites by email and shows the link it issued', async () => {
    const user = userEvent.setup();
    render(<OrganizationInvites />);
    await user.click(screen.getByRole('button', { name: 'com_ui_settings_section_org_invites' }));

    await user.type(await screen.findByLabelText('com_ui_org_invite_email'), ' carol@example.com ');
    await user.click(screen.getByRole('button', { name: 'com_ui_org_invite_send' }));
    expect(mockCreateMutate).toHaveBeenCalledWith({
      kind: 'email',
      email: 'carol@example.com',
      role: 'USER',
    });

    act(() => {
      mockCreateOptions.current?.onSuccess?.({
        invite: { id: 'invite-1', kind: 'email', email: 'carol@example.com' },
        url: 'https://chat.example.com/invite/abc',
        emailSent: false,
      });
    });
    expect(await screen.findByTestId('invite-url')).toHaveTextContent(
      'https://chat.example.com/invite/abc',
    );
  });

  it('creates a link with the chosen use limit', async () => {
    const user = userEvent.setup();
    render(<OrganizationInvites />);
    await user.click(screen.getByRole('button', { name: 'com_ui_settings_section_org_invites' }));

    const uses = await screen.findByLabelText('com_ui_org_invite_max_uses');
    await user.clear(uses);
    await user.type(uses, '5');
    await user.click(screen.getByRole('button', { name: 'com_ui_org_invite_link_create' }));

    expect(mockCreateMutate).toHaveBeenCalledWith({ kind: 'link', role: 'USER', maxUses: 5 });
  });

  it('revokes and resends pending invitations', async () => {
    mockInvitesState.current = {
      isLoading: false,
      data: {
        invites: [
          {
            id: 'invite-1',
            kind: 'email',
            email: 'dan@example.com',
            role: 'USER',
            status: 'pending',
            expiresAt: '2030-01-01T00:00:00.000Z',
            maxUses: 1,
            useCount: 0,
          },
        ],
      },
    };
    const user = userEvent.setup();
    render(<OrganizationInvites />);
    await user.click(screen.getByRole('button', { name: 'com_ui_settings_section_org_invites' }));

    expect(await screen.findByText('dan@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'com_ui_org_invite_resend' }));
    await user.click(screen.getByRole('button', { name: 'com_ui_org_invite_revoke' }));

    expect(mockResendMutate).toHaveBeenCalledWith('invite-1');
    expect(mockRevokeMutate).toHaveBeenCalledWith('invite-1');
  });

  it('shows an empty pending list', async () => {
    const user = userEvent.setup();
    render(<OrganizationInvites />);
    await user.click(screen.getByRole('button', { name: 'com_ui_settings_section_org_invites' }));

    expect(await screen.findByText('com_ui_org_invites_empty')).toBeInTheDocument();
  });
});
