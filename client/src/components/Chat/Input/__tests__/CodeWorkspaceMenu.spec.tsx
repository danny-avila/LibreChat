import { AxiosError } from 'axios';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { AxiosResponse } from 'axios';
import type { CodeWorkspaceResult } from '~/hooks';
import CodeWorkspaceMenu from '../CodeWorkspaceMenu';

const mockShowToast = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => {
  const { cloneElement } = jest.requireActual('react');
  return {
    composerControlClasses: () => 'composer-control',
    useToastContext: () => ({ showToast: mockShowToast }),
    TooltipAnchor: ({
      render,
      children,
    }: {
      render: React.ReactElement;
      children: React.ReactNode;
    }) => cloneElement(render, {}, children),
  };
});

const conversation = {
  conversationId: 'new',
  endpoint: 'agents',
  agent_id: 'agent-1',
  title: 'Code',
} as TConversation;
const environment = {
  id: 'personal-vm',
  name: 'Personal VM',
  type: 'attached' as const,
  baseURL: 'https://code.example.com',
};

function workspace(overrides: Partial<CodeWorkspaceResult> = {}): CodeWorkspaceResult {
  const selected = { environmentId: environment.id, workspaceId: 'project-a' };
  return {
    required: true,
    supportsEnvironmentDecisions: true,
    locked: false,
    mode: 'attached',
    state: 'ready',
    canSubmit: true,
    environments: [
      {
        environment,
        state: 'ready',
        workspaces: [{ id: 'project-a', name: 'Project A' }],
        selected,
      },
    ],
    selections: [selected],
    resolveSelections: () => [selected],
    resolveSubmission: () => ({ codeEnvironmentMode: 'attached', codeWorkspaces: [selected] }),
    rememberSelection: jest.fn(),
    ...overrides,
  };
}

function renderMenu(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CodeWorkspaceMenu', () => {
  test('shows a suggested workspace without committing the conversation decision', () => {
    const setConversation = jest.fn();
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={setConversation}
        workspace={workspace()}
        disabled={false}
      />,
    );

    expect(setConversation).not.toHaveBeenCalled();
    expect(screen.getByTestId('code-workspace')).toHaveTextContent('Project A');
  });

  test('allows working without an attached workspace even while the worker is unavailable', async () => {
    const setConversation = jest.fn();
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={setConversation}
        workspace={workspace({
          mode: undefined,
          state: 'unavailable',
          selections: undefined,
          environments: [
            {
              environment,
              state: 'unavailable',
              workspaces: [],
              selected: undefined,
            },
          ],
        })}
        disabled={false}
      />,
    );

    await userEvent.click(screen.getByTestId('code-workspace'));
    await userEvent.click(await screen.findByText('com_ui_code_workspace_without_attached'));

    const update = setConversation.mock.calls[0][0];
    expect(update(conversation)).toEqual({
      ...conversation,
      codeEnvironmentMode: 'without_attached',
      codeWorkspaces: undefined,
    });
  });

  test('does not offer selection-less decisions before the API advertises support', async () => {
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={jest.fn()}
        workspace={workspace({ supportsEnvironmentDecisions: false })}
        disabled={false}
      />,
    );

    await userEvent.click(screen.getByTestId('code-workspace'));

    expect(
      screen.queryByRole('menuitemradio', { name: /com_ui_code_workspace_without_attached/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Project A/ })).toBeInTheDocument();
  });

  test('commits an explicit attached-workspace choice only when the user selects it', async () => {
    const setConversation = jest.fn();
    const rememberSelection = jest.fn();
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={setConversation}
        workspace={workspace({ mode: undefined, state: 'choose', rememberSelection })}
        disabled={false}
      />,
    );

    await userEvent.click(screen.getByTestId('code-workspace'));
    await userEvent.click((await screen.findAllByText('Project A'))[1]);

    expect(rememberSelection).toHaveBeenCalledWith({
      environmentId: 'personal-vm',
      workspaceId: 'project-a',
    });
    const update = setConversation.mock.calls[0][0];
    expect(update(conversation)).toEqual({
      ...conversation,
      codeEnvironmentMode: 'attached',
      codeWorkspaces: [{ environmentId: 'personal-vm', workspaceId: 'project-a' }],
    });
  });

  test('does not mark a suggested workspace selected in no-attached mode', async () => {
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={jest.fn()}
        workspace={workspace({ mode: 'without_attached', state: 'without_attached' })}
        disabled={false}
      />,
    );

    await userEvent.click(screen.getByTestId('code-workspace'));

    expect(
      screen.getByRole('menuitemradio', { name: /com_ui_code_workspace_without_attached/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: /Project A/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('hides the chooser after the conversation decision is locked', () => {
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={jest.fn()}
        workspace={workspace({ locked: true })}
        disabled={false}
      />,
    );

    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
  });

  test('shows recovery status when a locked workspace is unavailable', () => {
    renderMenu(
      <CodeWorkspaceMenu
        setConversation={jest.fn()}
        workspace={workspace({
          locked: true,
          canSubmit: false,
          state: 'unavailable',
          selections: undefined,
          environments: [
            { environment, state: 'unavailable', workspaces: [], selected: undefined },
          ],
        })}
        disabled={false}
      />,
    );

    expect(screen.getByTestId('code-workspace-locked-status')).toHaveAccessibleName(
      'com_ui_code_workspace_unavailable. com_ui_code_workspace_locked_recovery',
    );
  });

  describe('a chat sealed to a machine its agent no longer uses', () => {
    const mac = { environmentId: 'mac', workspaceId: 'primary' };
    const moved = { environmentId: environment.id, workspaceId: 'project-a' };
    const sealed = { ...conversation, conversationId: 'existing' } as TConversation;
    const teamVm = {
      id: 'team-vm',
      name: 'Team VM',
      type: 'attached' as const,
      baseURL: 'https://team.example.com',
    };

    type Target = NonNullable<CodeWorkspaceResult['relocation']>['targets'][number];
    const target = (
      targetEnvironment: Target['environment'],
      workspaces: Target['workspaces'],
    ): Target => ({
      environment: targetEnvironment,
      state: 'choose',
      workspaces,
      selected: undefined,
    });

    const relocatable = (targets: Target[], rememberSelection = jest.fn()) =>
      workspace({
        locked: true,
        canSubmit: false,
        state: 'relocatable',
        selections: undefined,
        rememberSelection,
        environments: targets,
        relocation: {
          conversationId: 'existing',
          from: [mac],
          previous: [{ id: 'mac', name: 'Danny Mac' }],
          retained: [],
          targets,
        },
      });

    const confirmItem = () => screen.findByRole('menuitem', { name: /com_ui_code_workspace_move/ });

    beforeEach(() => {
      mockShowToast.mockReset();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('moves the chat onto the sole workspace its agent now uses', async () => {
      const moveSpy = jest.spyOn(dataService, 'moveConversationCodeEnvironment').mockResolvedValue({
        conversationId: 'existing',
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [moved],
      });
      const setConversation = jest.fn();
      const rememberSelection = jest.fn();
      renderMenu(
        <CodeWorkspaceMenu
          setConversation={setConversation}
          workspace={relocatable(
            [target(environment, [{ id: 'project-a', name: 'Project A' }])],
            rememberSelection,
          )}
          disabled={false}
        />,
      );

      expect(screen.queryByTestId('code-workspace-locked-status')).not.toBeInTheDocument();
      await userEvent.click(screen.getByTestId('code-workspace-move'));
      expect(screen.getByRole('menuitemradio', { name: /Project A/ })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await userEvent.click(await confirmItem());

      await waitFor(() => expect(setConversation).toHaveBeenCalledTimes(1));
      expect(moveSpy).toHaveBeenCalledTimes(1);
      expect(moveSpy).toHaveBeenCalledWith({
        conversationId: 'existing',
        from: [mac],
        to: [moved],
      });
      expect(rememberSelection).toHaveBeenCalledWith(moved);
      const update = setConversation.mock.calls[0][0];
      expect(update(sealed)).toEqual({
        ...sealed,
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [moved],
      });
      expect(update(conversation)).toBe(conversation);
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('moves every new environment in one request once each has a workspace', async () => {
      const moveSpy = jest.spyOn(dataService, 'moveConversationCodeEnvironment').mockResolvedValue({
        conversationId: 'existing',
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [],
      });
      renderMenu(
        <CodeWorkspaceMenu
          setConversation={jest.fn()}
          workspace={relocatable([
            target(environment, [{ id: 'project-a', name: 'Project A' }]),
            target(teamVm, [
              { id: 'shared', name: 'Shared' },
              { id: 'scratch', name: 'Scratch' },
            ]),
          ])}
          disabled={false}
        />,
      );

      await userEvent.click(screen.getByTestId('code-workspace-move'));
      expect(await confirmItem()).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(screen.getByRole('menuitemradio', { name: /Scratch/ }));
      await userEvent.click(await confirmItem());

      await waitFor(() => expect(moveSpy).toHaveBeenCalledTimes(1));
      expect(moveSpy).toHaveBeenCalledWith({
        conversationId: 'existing',
        from: [mac],
        to: [moved, { environmentId: 'team-vm', workspaceId: 'scratch' }],
      });
    });

    test('drops a machine the agents stopped using with a single confirm', async () => {
      const moveSpy = jest.spyOn(dataService, 'moveConversationCodeEnvironment').mockResolvedValue({
        conversationId: 'existing',
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [moved],
      });
      const setConversation = jest.fn();
      const base = relocatable([]);
      renderMenu(
        <CodeWorkspaceMenu
          setConversation={setConversation}
          workspace={{
            ...base,
            relocation: {
              ...base.relocation!,
              from: [mac, moved],
              previous: [{ id: 'mac', name: 'Danny Mac' }],
              retained: [moved],
            },
          }}
          disabled={false}
        />,
      );

      await userEvent.click(screen.getByTestId('code-workspace-move'));
      expect(screen.getByText('com_ui_code_workspace_move_info_removed')).toBeInTheDocument();
      await userEvent.click(await confirmItem());

      await waitFor(() => expect(setConversation).toHaveBeenCalledTimes(1));
      expect(moveSpy).toHaveBeenCalledWith({
        conversationId: 'existing',
        from: [mac, moved],
        to: [moved],
      });
    });

    test('explains a new machine that advertises no workspace and cannot be moved to', async () => {
      const moveSpy = jest.spyOn(dataService, 'moveConversationCodeEnvironment');
      renderMenu(
        <CodeWorkspaceMenu
          setConversation={jest.fn()}
          workspace={relocatable([target(environment, [])])}
          disabled={false}
        />,
      );

      await userEvent.click(screen.getByTestId('code-workspace-move'));

      expect(screen.getByText('com_ui_code_workspace_unavailable')).toBeInTheDocument();
      const confirm = await confirmItem();
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      await userEvent.setup({ pointerEventsCheck: 0 }).click(confirm);
      expect(moveSpy).not.toHaveBeenCalled();
    });

    test.each([
      {
        name: 'the new machine rejected the workspace',
        data: { reason: 'missing' },
        key: 'com_error_code_workspace_missing',
      },
      {
        name: 'the decision changed elsewhere first',
        data: { reason: 'locked' },
        key: 'com_ui_code_workspace_move_stale',
      },
      {
        name: 'a response is still generating',
        data: { error: 'busy' },
        key: 'com_ui_code_workspace_move_busy',
      },
    ])('explains a refused move when $name and keeps the chat as it was', async ({ data, key }) => {
      jest.spyOn(dataService, 'moveConversationCodeEnvironment').mockRejectedValue(
        new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 409,
          data,
        } as AxiosResponse),
      );
      const setConversation = jest.fn();
      renderMenu(
        <CodeWorkspaceMenu
          setConversation={setConversation}
          workspace={relocatable([target(environment, [{ id: 'project-a', name: 'Project A' }])])}
          disabled={false}
        />,
      );

      await userEvent.click(screen.getByTestId('code-workspace-move'));
      await userEvent.click(await confirmItem());

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith({ message: key, status: 'error' }),
      );
      expect(setConversation).not.toHaveBeenCalled();
    });
  });
});
