import '~/locales/i18n';
import { PrincipalType, configSchema } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type * as t from '~/admin/types';
import { collectFieldPaths } from '~/admin/components/configuration/counts';
import { QueryClient, QueryClientProvider } from '~/admin/query';
import { ImportYamlDialog } from '../ImportYamlDialog';
import { extractSchemaTree } from '~/admin/api/config';
import { parseImportedYaml } from '~/admin/api';

const userScope: t.ConfigScope = {
  _id: 'cfg-user',
  principalType: PrincipalType.ROLE,
  principalId: 'USER',
  name: 'USER',
  priority: 10,
  isActive: true,
};

jest.mock('~/admin/api', () => ({
  parseImportedYaml: jest.fn(),
  createRoleFn: jest.fn(),
  createGroupFn: jest.fn(),
  createScopeFn: jest.fn(),
  searchUsersFn: jest.fn().mockResolvedValue({ users: [] }),
  getResolvedConfigFn: jest.fn().mockResolvedValue({
    resolvedConfig: { 'balance.startBalance': 5 },
    changedPaths: ['balance.startBalance'],
    overrides: { balance: { startBalance: 5 } },
    tombstones: [],
  }),
  baseConfigOptions: {
    queryKey: ['baseConfig'],
    queryFn: () =>
      Promise.resolve({
        config: { balance: { enabled: true, startBalance: 1000000 } },
        dbOverrides: {},
        yamlConfig: { balance: { enabled: true, startBalance: 1000000 } },
        yamlPaths: ['balance.enabled', 'balance.startBalance'],
        dbTombstones: [],
        schemaDefaults: {},
      }),
  },
  availableScopesOptions: {
    queryKey: ['availableScopes'],
    queryFn: () =>
      Promise.resolve([
        {
          _id: 'cfg-user',
          principalType: 'role',
          principalId: 'USER',
          name: 'USER',
          priority: 10,
          isActive: true,
        },
      ]),
  },
  allRolesQueryOptions: {
    queryKey: ['roles', 'all'],
    queryFn: () =>
      Promise.resolve([
        { id: 'ADMIN', name: 'ADMIN' },
        { id: 'USER', name: 'USER' },
      ]),
  },
  allGroupsQueryOptions: { queryKey: ['groups', 'all'], queryFn: () => Promise.resolve([]) },
}));

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const schemaPathSet = new Set(collectFieldPaths(tree));
const mockParse = jest.mocked(parseImportedYaml);
const parsed = {
  balance: { startBalance: 777, enabled: true },
  interface: { prompts: false },
  endpoints: { bedrock: { inferenceProfiles: { 'us.anthropic.claude': 'arn:x' } } },
};

function renderDialog(currentScope?: t.ConfigScope) {
  const onImport = jest
    .fn<
      ReturnType<t.ImportYamlDialogProps['onImport']>,
      Parameters<t.ImportYamlDialogProps['onImport']>
    >()
    .mockResolvedValue(undefined);
  const onClose = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ImportYamlDialog
        open
        onClose={onClose}
        currentScope={currentScope}
        schemaTree={tree}
        schemaPathSet={schemaPathSet}
        onImport={onImport}
      />
    </QueryClientProvider>,
  );
  return { onImport, onClose };
}

async function toTargets(text = 'balance:\n  startBalance: 777\n') {
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Paste YAML' }), { key: 'Enter' });
  fireEvent.change(await screen.findByRole('textbox', { name: 'Paste YAML' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Where should these settings go?');
}

async function toPreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }));
  await screen.findByText(/selected for/);
}

describe('ImportYamlDialog wizard', () => {
  beforeEach(() => {
    mockParse.mockResolvedValue({ success: true, appConfig: parsed, unknownPaths: [] });
  });

  it('previews exactly the snippet keys against Base and imports the selected ones', async () => {
    const { onImport, onClose } = renderDialog();
    await toTargets();
    expect(screen.getByRole('radio', { name: /^Base configuration/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await toPreview();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Start balance')).toBeInTheDocument();
    expect(within(dialog).getByText('1,000,000 (librechat.yaml)')).toBeInTheDocument();
    expect(within(dialog).queryByText('Enabled')).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Show 1 setting that is already set/ }),
    );
    expect(within(dialog).getByText(/Already set to this value/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Include Enabled' })).not.toBeChecked();
    expect(within(dialog).getByText(/2 keys won't be imported/)).toBeInTheDocument();
    expect(within(dialog).getByText(/managed with role permissions/)).toBeInTheDocument();
    expect(within(dialog).getByText(/"us.anthropic.claude"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 setting into Base/ }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith({
        target: { type: 'base' },
        entries: [{ fieldPath: 'balance.startBalance', value: 777 }],
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('preselects the open profile and compares with its own values', async () => {
    const { onImport } = renderDialog(userScope);
    await toTargets();
    expect(screen.getByRole('radio', { name: /This profile \(USER\)/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await toPreview();
    expect(await screen.findByText('5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 setting into Role: USER/ }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({ target: { type: 'scope', scope: userScope, exists: true } }),
      ),
    );
  });

  it('writes to Base when Base is chosen while a profile is open', async () => {
    const { onImport } = renderDialog(userScope);
    await toTargets();
    fireEvent.click(screen.getByRole('radio', { name: /^Base configuration/ }));
    await toPreview();
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 setting into Base/ }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ target: { type: 'base' } })),
    );
  });

  it('offers every role, including ones without a profile', async () => {
    const { onImport } = renderDialog();
    await toTargets();
    fireEvent.click(screen.getByRole('radio', { name: /^A role, group or user/ }));
    const admin = await screen.findByRole('radio', { name: /ADMIN.*No profile yet/ });
    expect(screen.getByRole('radio', { name: /USER.*Has a profile/ })).toBeInTheDocument();
    fireEvent.click(admin);
    expect(
      screen.getByText(/A profile will be created for ADMIN \(priority 10\)/),
    ).toBeInTheDocument();
    await toPreview();
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 setting into Role: ADMIN/ }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          target: {
            type: 'scope',
            exists: false,
            scope: expect.objectContaining({ principalId: 'ADMIN', priority: 10 }),
          },
        }),
      ),
    );
  });

  it('labels creating a role or group as a separate side effect', async () => {
    const { onImport } = renderDialog();
    await toTargets();
    fireEvent.click(screen.getByRole('radio', { name: /^Create a new role or group/ }));
    expect(screen.getByText(/Also creates the role or group itself/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'QA Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    await toPreview();
    fireEvent.click(
      screen.getByRole('button', { name: /^Import 1 setting into New Group: QA Team/ }),
    );
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { type: 'create', principalType: PrincipalType.GROUP, name: 'QA Team' },
        }),
      ),
    );
  });

  it('shows the line and column of a YAML syntax error', async () => {
    mockParse.mockResolvedValueOnce({
      success: false,
      error: 'Invalid YAML syntax (line 2, column 18)',
      mark: { line: 2, column: 18 },
      appConfig: null,
      unknownPaths: [],
    });
    renderDialog();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Paste YAML' }), { key: 'Enter' });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Paste YAML' }), {
      target: { value: 'balance:\n  startBalance: [1\n' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Line 2, column 18')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('2 |   startBalance: [1');
  });

  it('keeps the dialog open and shows the reason when the import is rejected', async () => {
    const { onImport, onClose } = renderDialog();
    onImport.mockRejectedValueOnce(new Error('Validation failed — balance.startBalance'));
    await toTargets();
    await toPreview();
    fireEvent.click(screen.getByRole('button', { name: /^Import 1 setting/ }));
    expect(await screen.findByText('Validation failed — balance.startBalance')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
