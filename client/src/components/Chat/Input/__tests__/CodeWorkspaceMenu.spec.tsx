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
  conversationId: 'conversation-1',
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
    resolveSubmission: () => ({ codeWorkspaces: [selected] }),
    rememberSelection: jest.fn(),
    ...overrides,
  };
}

describe('CodeWorkspaceMenu', () => {
  test('stores one unambiguous initial workspace on the conversation', () => {
    const setConversation = jest.fn();
    render(
      <CodeWorkspaceMenu
        conversation={conversation}
        setConversation={setConversation}
        workspace={workspace()}
        disabled={false}
      />,
    );

    const update = setConversation.mock.calls[0][0];
    expect(update(conversation)).toEqual({
      ...conversation,
      codeWorkspaces: [{ environmentId: 'personal-vm', workspaceId: 'project-a' }],
    });
    const navigated = { ...conversation, agent_id: 'different-agent' };
    expect(update(navigated)).toBe(navigated);
    const differentChat = { ...conversation, conversationId: 'different-chat' };
    expect(update(differentChat)).toBe(differentChat);
    expect(screen.getByTestId('code-workspace')).toHaveTextContent('Project A');
  });

  test('keeps a missing binding until the user explicitly selects a replacement', async () => {
    const savedConversation = {
      ...conversation,
      codeWorkspaces: [{ environmentId: 'personal-vm', workspaceId: 'removed-project' }],
    };
    const setConversation = jest.fn();
    const rememberSelection = jest.fn();
    render(
      <CodeWorkspaceMenu
        conversation={savedConversation}
        setConversation={setConversation}
        workspace={workspace({
          state: 'missing',
          selections: undefined,
          environments: [
            {
              environment,
              state: 'missing',
              workspaces: [{ id: 'project-a', name: 'Project A' }],
              selected: undefined,
            },
          ],
          rememberSelection,
        })}
        disabled={false}
      />,
    );

    expect(setConversation).not.toHaveBeenCalled();
    expect(screen.getByTestId('code-workspace')).toHaveTextContent('com_ui_code_workspace_missing');
    await userEvent.click(screen.getByTestId('code-workspace'));
    await userEvent.click(await screen.findByText('Project A'));

    expect(rememberSelection).toHaveBeenCalledWith({
      environmentId: 'personal-vm',
      workspaceId: 'project-a',
    });
    const update = setConversation.mock.calls[0][0];
    expect(update(savedConversation)).toEqual({
      ...savedConversation,
      codeWorkspaces: [{ environmentId: 'personal-vm', workspaceId: 'project-a' }],
    });
  });
});
