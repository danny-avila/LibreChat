import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SubagentThreadLink from '../SubagentThreadLink';

const mockUseGetConversationByIdQuery = jest.fn<
  { data: { conversationId: string } | undefined },
  [string, Record<string, unknown>?]
>(() => ({ data: undefined }));
const mockNavigateToConvo = jest.fn();

jest.mock('librechat-data-provider/react-query', () => ({
  useGetConversationByIdQuery: (id: string, config?: Record<string, unknown>) =>
    mockUseGetConversationByIdQuery(id, config),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    key === 'com_ui_subagent_back_to_parent' ? 'Back to parent chat' : 'Open child chat',
  useNavigateToConvo: () => ({ navigateToConvo: mockNavigateToConvo }),
}));

jest.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="left-icon" />,
  ChevronRight: () => <span data-testid="right-icon" />,
}));

describe('SubagentThreadLink', () => {
  const renderLink = (element: React.ReactElement) => render(element);

  beforeEach(() => {
    mockUseGetConversationByIdQuery.mockReset();
    mockUseGetConversationByIdQuery.mockReturnValue({ data: undefined });
    mockNavigateToConvo.mockReset();
  });

  it('loads a parent chat and navigates through the conversation state helper', () => {
    const parent = { conversationId: 'parent-thread' };
    mockUseGetConversationByIdQuery.mockReturnValue({ data: parent });
    renderLink(<SubagentThreadLink threadId="parent-thread" relation="parent" />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to parent chat' }));
    expect(mockNavigateToConvo).toHaveBeenCalledWith(parent);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    expect(mockUseGetConversationByIdQuery).toHaveBeenCalledWith(
      'parent-thread',
      expect.objectContaining({ enabled: true }),
    );
  });

  it('links a parent tool result only after the child conversation is durable', () => {
    mockUseGetConversationByIdQuery.mockReturnValue({
      data: { conversationId: 'child/thread' },
    });
    renderLink(<SubagentThreadLink threadId="child/thread" relation="child" />);

    fireEvent.click(screen.getByRole('button', { name: 'Open child chat' }));
    expect(mockNavigateToConvo).toHaveBeenCalledWith({ conversationId: 'child/thread' });
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('hides a provisional child link while polling for durable creation', () => {
    const { container } = renderLink(
      <SubagentThreadLink threadId="provisional-child" relation="child" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(mockUseGetConversationByIdQuery).toHaveBeenCalledWith(
      'provisional-child',
      expect.objectContaining({ enabled: true, retry: false }),
    );
    const config = mockUseGetConversationByIdQuery.mock.calls[0][1] as {
      refetchInterval: (conversation: unknown) => number | false;
    };
    expect(config.refetchInterval(undefined)).toBe(1500);
  });

  it('stops polling for a child that never became durable', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    renderLink(<SubagentThreadLink threadId="failed-child" relation="child" />);
    const config = mockUseGetConversationByIdQuery.mock.calls[0][1] as {
      refetchInterval: (conversation: unknown) => number | false;
    };

    now.mockReturnValue(70_000);
    expect(config.refetchInterval(undefined)).toBe(false);
    now.mockRestore();
  });

  it('does not render an empty thread selector', () => {
    const { container } = renderLink(<SubagentThreadLink threadId="   " relation="child" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('passes the complete fetched child record into conversation navigation', () => {
    const child = { conversationId: 'child-thread', title: 'Research child' };
    mockUseGetConversationByIdQuery.mockReturnValue({
      data: child,
    });
    renderLink(<SubagentThreadLink threadId="child-thread" relation="child" />);

    fireEvent.click(screen.getByRole('button', { name: 'Open child chat' }));
    expect(mockNavigateToConvo).toHaveBeenCalledWith(child);
  });
});
