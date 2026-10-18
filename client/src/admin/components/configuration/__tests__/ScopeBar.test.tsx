import { MemoryRouter } from 'react-router-dom';
import { PrincipalType } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { availableScopesOptions, toggleScopeActiveFn } from '~/admin/api';
import { ScopeActionsProvider } from '~/admin/contexts/ScopeContext';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { ScopeGate } from '../ScopeGate';
import { ScopeBar } from '../ScopeBar';

function mockLocalize(key: string, options?: Record<string, string | number>): string {
  if (!options) return key;
  const args = Object.entries(options)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${key}(${args})`;
}

jest.mock('~/admin/hooks', () => {
  const { useScopeActions } = jest.requireActual('~/admin/hooks/config/scope');
  return { useLocalize: () => mockLocalize, useScopeActions, useExpandSignal: () => undefined };
});

jest.mock('~/admin/api', () => ({
  availableScopesOptions: { queryKey: ['availableScopes'], queryFn: jest.fn() },
  toggleScopeActiveFn: jest.fn(),
}));

const engineering: t.ConfigScope = {
  _id: 'c-eng',
  principalType: PrincipalType.GROUP,
  principalId: 'g-eng',
  name: 'Engineering',
  priority: 20,
  memberCount: 3,
  isActive: true,
  overridePaths: ['interface.parameters', 'mcpServers.docs.url', 'mcpServers.docs.type'],
  tombstones: ['balance.startBalance'],
};
const design: t.ConfigScope = {
  ...engineering,
  _id: 'c-design',
  principalId: 'g-design',
  name: 'Design',
  memberCount: 1,
  overridePaths: ['interface'],
  tombstones: [],
};

function wrap(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ScopeBar', () => {
  it('names the profile and shows priority, members and override count', async () => {
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([engineering]);
    wrap(<ScopeBar scope={engineering} onBackToBase={jest.fn()} />);
    const bar = screen.getByRole('region', { name: 'com_admin_scope_bar_label' });
    expect(bar).toHaveTextContent(
      'com_admin_scope_bar_editing com_admin_scope_bar_name(type=com_admin_scope_type_group,name=Engineering)',
    );
    expect(bar).toHaveTextContent('com_admin_scope_priority(priority=20)');
    expect(bar).toHaveTextContent('com_admin_scope_member_count(count=3)');
    expect(bar).toHaveTextContent('com_admin_scope_override_count(count=3)');
  });

  it('warns about a same-priority profile that changes the same setting', async () => {
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([engineering, design]);
    wrap(<ScopeBar scope={engineering} onBackToBase={jest.fn()} />);
    expect(
      await screen.findByText(
        'com_admin_scope_tie_conflict(names=Design (com_admin_scope_type_group),count=1)',
      ),
    ).toBeInTheDocument();
  });

  it('shows an inactive profile with a way to activate it', async () => {
    const inactive = { ...engineering, isActive: false };
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([inactive]);
    jest.mocked(toggleScopeActiveFn).mockResolvedValue({ success: true });
    wrap(<ScopeBar scope={inactive} onBackToBase={jest.fn()} />);
    expect(screen.getByText('com_admin_scope_inactive_hint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_scope_activate' }));
    await waitFor(() =>
      expect(toggleScopeActiveFn).toHaveBeenCalledWith({
        data: { principalType: PrincipalType.GROUP, principalId: 'g-eng', isActive: true },
      }),
    );
  });

  it('says when the open profile was deleted and still offers the way back', async () => {
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([design]);
    const onBackToBase = jest.fn();
    wrap(<ScopeBar scope={engineering} onBackToBase={onBackToBase} />);
    expect(await screen.findByText('com_admin_scope_deleted')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_scope_back_to_base' }));
    expect(onBackToBase).toHaveBeenCalled();
  });
});

describe('ScopeGate', () => {
  it('explains why the section is not per profile and switches to Base', () => {
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([engineering]);
    const selectScope = jest.fn();
    wrap(
      <ScopeActionsProvider value={{ selectScope, editingScope: engineering }}>
        <ScopeGate reason="preAuth" title="Registration" section="registration" />
      </ScopeActionsProvider>,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'com_admin_scope_gate_title(section=Registration)com_admin_scope_gate_pre_auth',
    );
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_config_shell_edit_in_base' }));
    expect(selectScope).toHaveBeenCalledWith({ type: 'BASE' });
  });

  it('points out values the profile still stores in the gated section', async () => {
    const stale = { ...engineering, overridePaths: ['registration.socialLogins'] };
    jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([stale]);
    wrap(
      <ScopeActionsProvider value={{ selectScope: jest.fn(), editingScope: engineering }}>
        <ScopeGate reason="preAuth" title="Registration" section="registration" />
      </ScopeActionsProvider>,
    );
    expect(await screen.findByText('com_admin_scope_gate_ignored(count=1)')).toBeInTheDocument();
  });
});
