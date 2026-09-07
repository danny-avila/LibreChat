import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import CodeApprovalMenu from '../CodeApprovalMenu';

const mockSetConversation = jest.fn();
const mockUseCodeApprovalMode = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCodeApprovalMode: () => mockUseCodeApprovalMode(),
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
    mockUseCodeApprovalMode.mockReturnValue({
      available: true,
      modes: ['ask', 'acceptEdits'],
      selected: 'ask',
    });
  });

  test('defaults to ask and stores accept-edits on the conversation', async () => {
    render(
      <CodeApprovalMenu
        conversation={conversation}
        setConversation={mockSetConversation}
        disabled={false}
      />,
    );

    await userEvent.click(screen.getByTestId('code-approval-mode'));
    await userEvent.click(await screen.findByText('com_ui_code_approval_accept_edits'));

    const update = mockSetConversation.mock.calls[0][0];
    expect(update(conversation)).toEqual({ ...conversation, codeApprovalMode: 'acceptEdits' });
  });

  test('hides the control when code approvals are unavailable', () => {
    mockUseCodeApprovalMode.mockReturnValue({ available: false, modes: [] });

    render(
      <CodeApprovalMenu
        conversation={conversation}
        setConversation={mockSetConversation}
        disabled={false}
      />,
    );
    expect(screen.queryByTestId('code-approval-mode')).not.toBeInTheDocument();
  });
});
