import { fireEvent, render, screen } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import CodeApprovalMenu from '../CodeApprovalMenu';

const mockNewConversation = jest.fn();
const mockUseGetAgentsConfig = jest.fn();
const mockUseAgentToolPermissions = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAgentToolPermissions: () => mockUseAgentToolPermissions(),
  useGetAgentsConfig: () => mockUseGetAgentsConfig(),
}));

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'agents',
  agent_id: 'agent-1',
  title: 'Code',
} as TConversation;

describe('CodeApprovalMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAgentToolPermissions.mockReturnValue({
      codeAllowedByAgent: true,
      codeEnvironmentId: 'mac',
      statefulCodeSessionsAllowedByAgent: true,
    });
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          environments: [
            {
              id: 'mac',
              name: 'Mac',
              type: 'attached',
              baseURL: 'https://code.example.com',
              configSchema: {
                permissions: {
                  fileWrite: { allowed: ['ask', 'allow'], default: 'ask' },
                  commandExecution: { allowed: ['ask'], default: 'ask' },
                },
              },
            },
          ],
        },
      },
    });
  });

  test('defaults to ask and stores accept-edits on the conversation', () => {
    render(
      <CodeApprovalMenu
        conversation={conversation}
        newConversation={mockNewConversation}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByTestId('code-approval-mode'));
    fireEvent.click(screen.getByText('com_ui_code_approval_accept_edits'));

    expect(mockNewConversation).toHaveBeenCalledWith({
      template: { ...conversation, codeApprovalMode: 'acceptEdits' },
    });
  });

  test('hides the control for a managed environment', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          environments: [{ id: 'mac', name: 'Managed', type: 'managed' }],
        },
      },
    });

    render(
      <CodeApprovalMenu
        conversation={conversation}
        newConversation={mockNewConversation}
        disabled={false}
      />,
    );
    expect(screen.queryByTestId('code-approval-mode')).not.toBeInTheDocument();
  });

  test('hides the control when the agent does not use stateful sessions', () => {
    mockUseAgentToolPermissions.mockReturnValue({
      codeAllowedByAgent: true,
      codeEnvironmentId: 'mac',
      statefulCodeSessionsAllowedByAgent: false,
    });

    render(
      <CodeApprovalMenu
        conversation={conversation}
        newConversation={mockNewConversation}
        disabled={false}
      />,
    );
    expect(screen.queryByTestId('code-approval-mode')).not.toBeInTheDocument();
  });

  test('hides the control when approvals are disabled by the administrator', () => {
    mockUseGetAgentsConfig.mockReturnValue({
      agentsConfig: {
        statefulCodeSessions: {
          approvalsEnabled: false,
          environments: [{ id: 'mac', name: 'Mac', type: 'attached' }],
        },
      },
    });

    render(
      <CodeApprovalMenu
        conversation={conversation}
        newConversation={mockNewConversation}
        disabled={false}
      />,
    );
    expect(screen.queryByTestId('code-approval-mode')).not.toBeInTheDocument();
  });
});
