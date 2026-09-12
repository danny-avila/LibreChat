import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import type { CodeWorkspaceResult } from '~/hooks';
import CodeWorkspaceMenu from '../CodeWorkspaceMenu';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => {
  const { cloneElement } = jest.requireActual('react');
  return {
    composerControlClasses: () => 'composer-control',
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

describe('CodeWorkspaceMenu', () => {
  test('shows a suggested workspace without committing the conversation decision', () => {
    const setConversation = jest.fn();
    render(
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
    render(
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

  test('commits an explicit attached-workspace choice only when the user selects it', async () => {
    const setConversation = jest.fn();
    const rememberSelection = jest.fn();
    render(
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

  test('hides the chooser after the conversation decision is locked', () => {
    render(
      <CodeWorkspaceMenu
        setConversation={jest.fn()}
        workspace={workspace({ locked: true })}
        disabled={false}
      />,
    );

    expect(screen.queryByTestId('code-workspace')).not.toBeInTheDocument();
  });
});
