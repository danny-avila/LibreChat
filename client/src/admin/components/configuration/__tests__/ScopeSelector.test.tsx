import { PrincipalType } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as t from '~/admin/types';
import {
  createScopeFn,
  deleteScopeFn,
  searchUsersFn,
  toggleScopeActiveFn,
  allRolesQueryOptions,
  allGroupsQueryOptions,
} from '~/admin/api';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { ScopeSelector } from '../ScopeSelector';

function mockLocalize(key: string, options?: Record<string, string | number>): string {
  if (!options) return key;
  const args = Object.entries(options)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${key}(${args})`;
}

jest.mock('~/admin/hooks', () => {
  const { useDebouncedFilter } = jest.requireActual('~/admin/hooks/useDebouncedFilter');
  return { useLocalize: () => mockLocalize, useDebouncedFilter };
});

const mockScopes: t.ConfigScope[] = [
  {
    _id: 'c-role',
    principalType: PrincipalType.ROLE,
    principalId: 'USER',
    name: 'USER',
    priority: 10,
    memberCount: 3,
    isActive: true,
    overridePaths: ['balance.startBalance'],
    tombstones: [],
  },
  {
    _id: 'c-eng',
    principalType: PrincipalType.GROUP,
    principalId: 'g-eng',
    name: 'Engineering',
    priority: 20,
    memberCount: 3,
    isActive: true,
    overridePaths: ['interface.parameters', 'interface.presets'],
    tombstones: [],
  },
  {
    _id: 'c-design',
    principalType: PrincipalType.GROUP,
    principalId: 'g-design',
    name: 'Design',
    priority: 20,
    memberCount: 1,
    isActive: false,
    overridePaths: ['interface.parameters'],
    tombstones: [],
  },
  {
    _id: 'c-bob',
    principalType: PrincipalType.USER,
    principalId: 'u-bob',
    name: 'Bob Test',
    email: 'bob@test.local',
    priority: 100,
    isActive: true,
    overridePaths: ['interface.parameters'],
    tombstones: ['balance.startBalance'],
  },
];

jest.mock('~/admin/api', () => ({
  availableScopesOptions: {
    queryKey: ['availableScopes'],
    queryFn: () => Promise.resolve(mockScopes),
  },
  allRolesQueryOptions: { queryKey: ['roles', 'all'], queryFn: jest.fn() },
  allGroupsQueryOptions: { queryKey: ['groups', 'all'], queryFn: jest.fn() },
  createScopeFn: jest.fn(),
  deleteScopeFn: jest.fn(),
  searchUsersFn: jest.fn(),
  toggleScopeActiveFn: jest.fn(),
}));

const roleRows = (names: string[]): t.Role[] =>
  names.map((name) => ({
    id: name,
    name,
    description: '',
    isSystemRole: false,
    isActive: true,
    userCount: 0,
    permissions: {} as t.RolePermissions,
  }));

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(allRolesQueryOptions.queryFn!).mockResolvedValue(roleRows(['ADMIN', 'USER']));
  jest.mocked(allGroupsQueryOptions.queryFn!).mockResolvedValue([]);
});

interface RenderOptions {
  selection?: t.ScopeSelection;
  isDirty?: boolean;
}

function renderSelector({ selection = { type: 'BASE' }, isDirty = false }: RenderOptions = {}) {
  const onSelect = jest.fn();
  const onOpenChange = jest.fn();
  const onError = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ScopeSelector
        open
        onOpenChange={onOpenChange}
        currentSelection={selection}
        onSelect={onSelect}
        permissions={{ canView: true, canEdit: true, canAssign: true }}
        onError={onError}
        isDirty={isDirty}
      />
    </QueryClientProvider>,
  );
  return { onSelect, onOpenChange, onError };
}

const row = (name: RegExp) => screen.findByRole('option', { name });

describe('ScopeSelector list', () => {
  it('shows each profile with its priority, members and override count', async () => {
    renderSelector();
    const eng = await row(/^Engineering/);
    expect(eng).toHaveTextContent('com_admin_scope_priority(priority=20)');
    expect(eng).toHaveTextContent('com_admin_scope_member_count(count=3)');
    expect(eng).toHaveTextContent('com_admin_scope_override_count(count=2)');
    expect(await row(/^Bob Test/)).toHaveTextContent('bob@test.local');
    expect(screen.getByText('com_admin_scope_base_applies')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('com_admin_scope_search_profiles')).toBeInTheDocument();
  });

  it('marks inactive profiles and only warns about ties that change the same setting', async () => {
    renderSelector();
    expect(within(await row(/^Design/)).getByText('com_admin_scope_inactive')).toBeInTheDocument();
    expect(within(await row(/^Engineering/)).queryByText(/com_admin_scope_tie_short/)).toBeNull();
  });

  it('warns when active profiles with the same priority change the same setting', async () => {
    mockScopes[2].isActive = true;
    try {
      renderSelector();
      const eng = await row(/^Engineering/);
      expect(within(eng).getByText('com_admin_scope_tie_short(names=Design)')).toBeInTheDocument();
    } finally {
      mockScopes[2].isActive = false;
    }
  });

  it('finds a user profile by name or email', async () => {
    renderSelector();
    await row(/^Bob Test/);
    const input = screen.getByPlaceholderText('com_admin_scope_search_profiles');
    fireEvent.change(input, { target: { value: 'bob' } });
    await waitFor(() => expect(screen.queryByRole('option', { name: /^Engineering/ })).toBeNull());
    expect(screen.getByRole('option', { name: /^Bob Test/ })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'bob@test' } });
    expect(await row(/^Bob Test/)).toBeInTheDocument();
  });

  it('re-selecting the open profile only closes the selector', async () => {
    const eng = mockScopes[1];
    const { onSelect, onOpenChange } = renderSelector({ selection: { type: 'SCOPE', scope: eng } });
    fireEvent.click(await row(/^Engineering/));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('selecting another profile opens it', async () => {
    const { onSelect } = renderSelector();
    fireEvent.click(await row(/^Engineering/));
    expect(onSelect).toHaveBeenCalledWith({ type: 'SCOPE', scope: mockScopes[1] });
  });

  it('toggles a profile active without selecting it', async () => {
    jest.mocked(toggleScopeActiveFn).mockResolvedValue({ success: true });
    const { onSelect } = renderSelector();
    await row(/^Engineering/);
    const active = screen.getByRole('option', {
      name: 'com_admin_scope_active_option(name=Engineering)',
    });
    expect(active).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(active);
    await waitFor(() =>
      expect(toggleScopeActiveFn).toHaveBeenCalledWith({
        data: { principalType: PrincipalType.GROUP, principalId: 'g-eng', isActive: false },
      }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ScopeSelector delete', () => {
  it('cannot delete the open profile while there are unsaved edits', async () => {
    renderSelector({ selection: { type: 'SCOPE', scope: mockScopes[1] }, isDirty: true });
    await row(/^Engineering/);
    const trash = screen.getByRole('option', {
      name: 'com_admin_scope_delete_named(name=Engineering)',
    });
    expect(trash).toHaveAttribute('aria-disabled', 'true');
    expect(trash).toHaveAttribute('title', 'com_admin_scope_delete_dirty');
    fireEvent.click(trash);
    expect(screen.queryByText(/com_admin_scope_delete_confirm/)).toBeNull();
    expect(deleteScopeFn).not.toHaveBeenCalled();
  });

  it('deleting the open profile returns to Base', async () => {
    jest.mocked(deleteScopeFn).mockResolvedValue({ success: true });
    const { onSelect } = renderSelector({ selection: { type: 'SCOPE', scope: mockScopes[1] } });
    await row(/^Engineering/);
    fireEvent.click(
      screen.getByRole('option', { name: 'com_admin_scope_delete_named(name=Engineering)' }),
    );
    expect(screen.getByText('com_admin_scope_delete_impact(count=2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_scope_delete' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ type: 'BASE' }));
    expect(deleteScopeFn).toHaveBeenCalledWith({
      data: { principalType: PrincipalType.GROUP, principalId: 'g-eng' },
    });
  });

  it('offers delete for user profiles too', async () => {
    renderSelector();
    await row(/^Bob Test/);
    expect(
      screen.getByRole('option', {
        name: 'com_admin_scope_delete_named(name=Bob Test (bob@test.local))',
      }),
    ).toBeInTheDocument();
  });
});

describe('ScopeSelector create picker', () => {
  async function openCreate() {
    fireEvent.click(await screen.findByRole('button', { name: 'com_admin_scope_create' }));
    return screen.findByPlaceholderText('com_admin_scope_create_search');
  }

  it('styles groups as cmdk groups and explains each empty state', async () => {
    renderSelector();
    await openCreate();
    expect(await screen.findByText('com_admin_scope_no_groups')).toBeInTheDocument();
    expect(screen.getByText('com_admin_scope_user_search_hint')).toBeInTheDocument();
    const heading = screen.getByText('com_admin_scope_groups');
    expect(heading).toHaveAttribute('cmdk-group-heading');
    expect(await screen.findByRole('option', { name: /^ADMIN/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^USER/ })).toBeNull();
  });

  it('says when every role already has a profile', async () => {
    jest.mocked(allRolesQueryOptions.queryFn!).mockResolvedValue(roleRows(['USER']));
    renderSelector();
    await openCreate();
    expect(await screen.findByText('com_admin_scope_all_roles_used')).toBeInTheDocument();
  });

  it('creates a role profile at the default priority and opens it', async () => {
    const created: t.ConfigScope = {
      ...mockScopes[0],
      _id: 'c-admin',
      principalId: 'ADMIN',
      name: 'ADMIN',
    };
    jest.mocked(createScopeFn).mockResolvedValue({ scope: created });
    const { onSelect } = renderSelector();
    await openCreate();
    fireEvent.click(await screen.findByRole('option', { name: /^ADMIN/ }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ type: 'SCOPE', scope: created }));
    expect(createScopeFn).toHaveBeenCalledWith({
      data: { principalType: PrincipalType.ROLE, principalId: 'ADMIN', name: 'ADMIN' },
    });
  });

  it('finds users by search and creates a user profile', async () => {
    jest.mocked(searchUsersFn).mockResolvedValue({
      users: [
        { id: 'u-bob', name: 'Bob Test', email: 'bob@test.local' },
        { id: 'u-alice', name: 'Alice Smith', email: 'alice@test.local' },
      ],
    });
    const created: t.ConfigScope = { ...mockScopes[3], _id: 'c-alice', principalId: 'u-alice' };
    jest.mocked(createScopeFn).mockResolvedValue({ scope: created });
    const { onSelect } = renderSelector();
    const input = await openCreate();
    fireEvent.change(input, { target: { value: 'ali' } });
    await waitFor(() => expect(searchUsersFn).toHaveBeenCalledWith({ data: { query: 'ali' } }));
    const alice = await screen.findByRole('option', { name: /^Alice Smith/ });
    expect(screen.queryByRole('option', { name: /^Bob Test/ })).toBeNull();
    fireEvent.click(alice);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ type: 'SCOPE', scope: created }));
    expect(createScopeFn).toHaveBeenCalledWith({
      data: {
        principalType: PrincipalType.USER,
        principalId: 'u-alice',
        name: 'Alice Smith',
        email: 'alice@test.local',
      },
    });
  });
});
