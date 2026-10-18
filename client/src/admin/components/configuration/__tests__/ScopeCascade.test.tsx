import { PrincipalType } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { availableScopesOptions, fieldProfileValuesOptions } from '~/admin/api';
import { QueryClient, QueryClientProvider, queryOptions } from '~/admin/query';
import { ScopeActionsProvider } from '~/admin/contexts/ScopeContext';
import { ScopeOverridesDialog } from '../ScopeOverridesDialog';
import { ConfigRow } from '../ConfigRow';

const mockNavigate = jest.fn();

function mockLocalize(key: string, options?: Record<string, string | number>): string {
  if (!options) return key;
  const args = Object.entries(options)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${key}(${args})`;
}

jest.mock('~/admin/router', () => ({ useNavigate: () => mockNavigate }));

jest.mock('~/admin/hooks', () => {
  const scope = jest.requireActual('~/admin/hooks/config/scope');
  const field = jest.requireActual('~/admin/hooks/config/field');
  return {
    useLocalize: () => mockLocalize,
    useScopeActions: scope.useScopeActions,
    useFieldProfiles: scope.useFieldProfiles,
    useFieldState: field.useFieldState,
    useRevertLabels: field.useRevertLabels,
    useHasValueLayers: field.useHasValueLayers,
    useValuesScope: field.useValuesScope,
  };
});

jest.mock('~/admin/api', () => ({
  availableScopesOptions: { queryKey: ['availableScopes'], queryFn: jest.fn() },
  fieldProfileValuesOptions: jest.fn(),
}));

const role: t.ConfigScope = {
  _id: 'c-role',
  principalType: PrincipalType.ROLE,
  principalId: 'USER',
  name: 'USER',
  priority: 10,
  isActive: true,
  overridePaths: ['interface.parameters', 'balance.startBalance'],
  tombstones: [],
};
const bob: t.ConfigScope = {
  _id: 'c-bob',
  principalType: PrincipalType.USER,
  principalId: 'u-bob',
  name: 'Bob Test',
  email: 'bob@test.local',
  priority: 100,
  isActive: true,
  overridePaths: ['mcpServers.docs.url', 'mcpServers.docs.type'],
  tombstones: ['interface.parameters'],
};

beforeAll(() => {
  jest.mocked(fieldProfileValuesOptions).mockImplementation((fieldPath: string) =>
    queryOptions<t.FieldProfileValue[]>({
      queryKey: ['fieldProfileValues', fieldPath],
      queryFn: () => Promise.resolve([{ scope: role, value: false }]),
    }),
  );
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(availableScopesOptions.queryFn!).mockResolvedValue([bob, role]);
});

function renderPage(children: ReactNode, editingScope?: t.ConfigScope) {
  const selectScope = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ScopeActionsProvider value={{ selectScope, editingScope }}>{children}</ScopeActionsProvider>
    </QueryClientProvider>,
  );
  return { selectScope };
}

const parametersRow = (
  <ConfigRow title="Parameters" fieldPath="interface.parameters" fieldId="interface-parameters">
    <input id="interface-parameters" />
  </ConfigRow>
);

describe('field cascade on a settings row', () => {
  it('in Base, says which profiles override the field and opens one', async () => {
    const { selectScope } = renderPage(parametersRow);
    const link = await screen.findByRole('button', {
      name: 'com_admin_scope_overridden_many(count=2)',
    });
    fireEvent.click(link);
    expect(await screen.findByText('Bob Test (bob@test.local)')).toBeInTheDocument();
    expect(screen.getByText('com_admin_scope_cascade_hidden')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('false')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'com_admin_scope_cascade_open' })[0]);
    expect(selectScope).toHaveBeenCalledWith({ type: 'SCOPE', scope: role });
  });

  it('shows nothing for a field no profile overrides', async () => {
    renderPage(
      <ConfigRow title="Presets" fieldPath="interface.presets" fieldId="interface-presets">
        <input />
      </ConfigRow>,
    );
    await waitFor(() => expect(availableScopesOptions.queryFn).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /com_admin_scope_overridden/ })).toBeNull();
  });

  it('is not shown while a profile is open', async () => {
    renderPage(parametersRow, role);
    await waitFor(() => expect(availableScopesOptions.queryFn).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /com_admin_scope_overridden/ })).toBeNull();
  });
});

describe('ScopeOverridesDialog', () => {
  it('lists each setting once, with values, hidden paths and removal', () => {
    const onRevert = jest.fn();
    renderPage(
      <ScopeOverridesDialog
        open
        scope={bob}
        values={{ 'mcpServers.docs.url': 'https://docs' }}
        pendingResets={new Set()}
        onClose={jest.fn()}
        onRevert={onRevert}
      />,
    );
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(screen.getByText(/: https:\/\/docs$/)).toBeInTheDocument();
    expect(screen.getByText('parameters')).toBeInTheDocument();
    expect(screen.queryByText('interface.parameters')).toBeNull();
    expect(screen.getByText('com_admin_scope_overrides_hidden')).toBeInTheDocument();
    const removes = screen.getAllByRole('button', { name: 'com_admin_scope_overrides_revert' });
    expect(removes).toHaveLength(1);
    fireEvent.click(removes[0]);
    expect(onRevert).toHaveBeenCalledWith(['mcpServers.docs.url', 'mcpServers.docs.type']);
  });

  it('jumps to a setting on its tab', () => {
    const onClose = jest.fn();
    renderPage(<ScopeOverridesDialog open scope={role} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'com_admin_scope_overrides_go' })[1]);
    expect(onClose).toHaveBeenCalled();
    const { search } = mockNavigate.mock.calls[0][0] as {
      search: (prev: Record<string, string>) => Record<string, string>;
    };
    expect(search({ scope: 'c-role' })).toEqual({
      scope: 'c-role',
      tab: 'system',
      field: 'balance.startBalance',
    });
  });

  it('lists each custom endpoint the profile overrides, with what it sets, and opens its card', () => {
    const onClose = jest.fn();
    const onRevertEntry = jest.fn();
    const withEntries: t.ConfigScope = {
      ...role,
      overridePaths: ['endpoints.custom'],
      overrideEntries: { 'endpoints.custom': ['Claude', 'Mine'] },
    };
    renderPage(
      <ScopeOverridesDialog
        open
        scope={withEntries}
        values={{
          'endpoints.custom': [
            { name: 'Claude', modelDisplayLabel: 'Claude (USER)' },
            { name: 'Mine', models: { default: ['m1'] } },
          ],
        }}
        config={{ endpoints: { custom: [{ name: 'GPT' }, { name: 'Claude' }, { name: 'Mine' }] } }}
        onClose={onClose}
        onRevertEntry={onRevertEntry}
        isEntryPending={(_path, identity) => identity === 'Mine'}
      />,
    );
    expect(screen.getByText('com_admin_config_tab_custom_endpoints')).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText(/: Claude \(USER\)$/)).toBeInTheDocument();
    expect(screen.getByText(/: m1$/)).toBeInTheDocument();
    expect(screen.queryByText(/\{"/)).toBeNull();
    const removes = screen.getAllByRole('button', { name: 'com_admin_scope_overrides_revert' });
    expect(removes[1]).toBeDisabled();
    fireEvent.click(removes[0]);
    expect(onRevertEntry).toHaveBeenCalledWith('endpoints.custom', 'Claude');
    fireEvent.click(screen.getAllByRole('button', { name: 'com_admin_scope_overrides_go' })[0]);
    const { search } = mockNavigate.mock.calls[0][0] as {
      search: (prev: Record<string, string>) => Record<string, string>;
    };
    expect(search({})).toEqual({ tab: 'custom', field: 'endpoints.custom.1' });
  });

  it('names the specs of a model spec list the profile owns, not its raw value', () => {
    renderPage(
      <ScopeOverridesDialog
        open
        scope={{ ...role, overridePaths: ['modelSpecs.list'] }}
        values={{ 'modelSpecs.list': [{ name: 'spec-a', label: 'A' }, { name: 'spec-b' }] }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('spec-a, spec-b')).toBeInTheDocument();
  });

  it('says when the profile overrides nothing', () => {
    renderPage(
      <ScopeOverridesDialog
        open
        scope={{ ...role, overridePaths: [], tombstones: [] }}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('com_admin_scope_overrides_empty')).toBeInTheDocument();
  });
});
