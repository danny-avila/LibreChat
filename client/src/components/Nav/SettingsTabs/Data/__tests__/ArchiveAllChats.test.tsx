import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArchiveAllChats } from '../ArchiveAllChats';

const mockMutate = jest.fn();
const mockShowToast = jest.fn();
const mockStartNewChat = jest.fn();
let mockIsLoading = false;

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useToastContext: () => ({ showToast: mockShowToast }),
  };
});

jest.mock('~/data-provider', () => ({
  useArchiveAllConversationsMutation: () => ({
    mutate: mockMutate,
    isLoading: mockIsLoading,
  }),
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
    jest.clearAllMocks();
  });

  it('submits through the shared button and closes the confirmation dialog', async () => {
    render(<ArchiveAllChats />);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_archive' }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the loading spinner in the shared submit button', () => {
    const { rerender } = render(<ArchiveAllChats />);
    fireEvent.click(screen.getByRole('button', { name: 'com_nav_archive_all_chats' }));

    mockIsLoading = true;
    rerender(<ArchiveAllChats />);

    const submit = screen.getByRole('button', { name: 'com_ui_archive' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit.querySelector('svg.spinner')).toBeInTheDocument();
  });
});
