import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArchiveAllChats } from '../ArchiveAllChats';

const mockMutate = jest.fn();
const mockShowToast = jest.fn();
const mockStartNewChat = jest.fn();
const mockGetConversation = jest.fn();
let mockIsLoading = false;
let mockOnSuccess: (() => void) | undefined;

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useToastContext: () => ({ showToast: mockShowToast }),
  };
});

jest.mock('~/data-provider', () => ({
  useArchiveAllConversationsMutation: (options?: { onSuccess?: () => void }) => {
    mockOnSuccess = options?.onSuccess;
    return {
      mutate: mockMutate,
      isLoading: mockIsLoading,
    };
  },
}));

jest.mock('~/hooks/Conversations/useGetConversation', () => ({
  __esModule: true,
  default: () => mockGetConversation,
}));

jest.mock('~/hooks/Chat/useNewChat', () => ({
  __esModule: true,
  default: () => ({ startNewChat: mockStartNewChat }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('ArchiveAllChats', () => {
  beforeEach(() => {
    mockIsLoading = false;
    mockOnSuccess = undefined;
    jest.clearAllMocks();
    mockGetConversation.mockReturnValue({
      conversationId: 'conversation-1',
      isTemporary: false,
    });
  });

  it('submits through the shared button and closes the confirmation dialog', async () => {
    render(<ArchiveAllChats />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('disables the trigger and submit button while showing the loading spinner', () => {
    const { rerender } = render(<ArchiveAllChats />);
    const trigger = screen.getByRole('button', { name: 'com_nav_archive_all_chats' });
    fireEvent.click(trigger);

    mockIsLoading = true;
    rerender(<ArchiveAllChats />);

    const submit = screen.getByRole('button', { name: 'com_ui_archive' });
    expect(trigger).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit.querySelector('svg.spinner')).toBeInTheDocument();
  });

  it('starts a new chat when the archived conversation is still active', () => {
    render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    mockOnSuccess?.();

    expect(mockStartNewChat).toHaveBeenCalledTimes(1);
  });

  it('keeps a conversation opened while the archive request was pending', () => {
    render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));
    mockGetConversation.mockReturnValue({
      conversationId: 'conversation-2',
      isTemporary: false,
    });

    mockOnSuccess?.();

    expect(mockStartNewChat).not.toHaveBeenCalled();
  });

  it('keeps a temporary conversation that the backend did not archive', () => {
    mockGetConversation.mockReturnValue({
      conversationId: 'temporary-conversation',
      isTemporary: true,
    });
    render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    mockOnSuccess?.();

    expect(mockStartNewChat).not.toHaveBeenCalled();
  });

  it('keeps a legacy temporary conversation that the backend did not archive', () => {
    mockGetConversation.mockReturnValue({
      conversationId: 'legacy-temporary-conversation',
      expiredAt: '2026-08-16T12:00:00.000Z',
    });
    render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));
    mockGetConversation.mockReturnValue({
      conversationId: 'legacy-temporary-conversation',
      isTemporary: false,
    });

    mockOnSuccess?.();

    expect(mockStartNewChat).not.toHaveBeenCalled();
  });

  it('keeps a new chat that has no persisted conversation id', () => {
    mockGetConversation.mockReturnValue(null);
    render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    mockOnSuccess?.();

    expect(mockStartNewChat).not.toHaveBeenCalled();
  });
});
