import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PendingSteer } from '~/store/families';
import PendingSteers from '../PendingSteers';
import store from '~/store';

const mockCancelMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useCancelSteerMutation: () => ({ mutate: mockCancelMutate }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ user: { name: 'Danny', username: 'danny' } }),
}));

/** Stub the provider-backed leaves — these tests cover the slot's filtering
 *  and the user-message presentation contract, not icon/markdown internals. */
jest.mock('~/components/Chat/Messages/MessageIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="user-icon" />,
}));

jest.mock('~/components/Chat/Messages/ui/MessageTimestamp', () => ({
  __esModule: true,
  default: ({ value }: { value?: string | null }) => (
    <time data-testid="steer-timestamp">{value}</time>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file, onClick }: { file: { filename?: string }; onClick?: () => void }) => (
    <button type="button" data-testid="steer-file" onClick={onClick}>
      {file.filename}
    </button>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileName }: { open: boolean; fileName: string }) =>
    open ? <div data-testid="steer-file-preview">{fileName}</div> : null,
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,

  default: ({ altText }: { altText: string }) => <img alt={altText} data-testid="steer-image" />,
}));

const CONVO_ID = 'convo-steers';

function renderSlot(steers: PendingSteer[], options?: { usernameDisplay?: boolean }) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), steers);
        if (options?.usernameDisplay != null) {
          set(store.UsernameDisplay, options.usernameDisplay);
        }
      }}
    >
      <PendingSteers conversationId={CONVO_ID} />
    </RecoilRoot>,
  );
}

describe('PendingSteers (in-thread optimistic steers)', () => {
  it('renders nothing when no steers are pending', () => {
    renderSlot([]);
    expect(screen.queryByTestId('steer-part')).toBeNull();
  });

  it('renders sending and pending steers as user-message parts, skipping failed ones', () => {
    renderSlot([
      { steerId: 's1', text: 'first correction', status: 'sending', createdAt: 1 },
      { steerId: 's2', text: 'second correction', status: 'pending', createdAt: 2 },
      { steerId: 's3', text: 'never sent', status: 'failed', createdAt: 3 },
    ]);
    const parts = screen.getAllByTestId('steer-part');
    expect(parts).toHaveLength(2);
    expect(screen.getByText('first correction')).toBeInTheDocument();
    expect(screen.getByText('second correction')).toBeInTheDocument();
    expect(screen.queryByText('never sent')).toBeNull();
    for (const part of parts) {
      expect(part).toHaveAttribute('data-steer-pending', 'true');
    }
  });

  it('presents the steer as a user message: icon and author name', () => {
    renderSlot([{ steerId: 's1', text: 'like you would say it', status: 'pending', createdAt: 1 }]);
    expect(screen.getByTestId('user-icon')).toBeInTheDocument();
    expect(screen.getByText('Danny')).toBeInTheDocument();
  });

  it('anchors each steer for the message-nav rail', () => {
    renderSlot([{ steerId: 's1', text: 'navigable words', status: 'pending', createdAt: 1 }]);
    const part = screen.getByTestId('steer-part');
    expect(part).toHaveAttribute('id', 'steer-s1');
    expect(part).toHaveClass('steer-render');
  });

  it('cancels a pending steer server-side and removes it from the thread', () => {
    renderSlot([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
      { steerId: 'local-1', text: 'still posting', status: 'sending', createdAt: 2 },
    ]);
    // Only the server-acknowledged steer is cancellable — a 'sending' entry
    // has no server id yet.
    const cancels = screen.getAllByTestId('steer-cancel');
    expect(cancels).toHaveLength(1);

    fireEvent.click(cancels[0]);
    expect(mockCancelMutate).toHaveBeenCalledWith(
      { conversationId: CONVO_ID, steerId: 's-ack' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(screen.queryByText('waiting on boundary')).toBeNull();
    expect(screen.getByText('still posting')).toBeInTheDocument();
  });

  it('restores the entry when the cancel POST fails', () => {
    renderSlot([{ steerId: 's-err', text: 'network flake', status: 'pending', createdAt: 1 }]);
    fireEvent.click(screen.getByTestId('steer-cancel'));
    expect(screen.queryByText('network flake')).toBeNull();

    const options = mockCancelMutate.mock.calls[0][1] as { onError: () => void };
    act(() => options.onError());
    expect(screen.getByText('network flake')).toBeInTheDocument();
  });

  it('falls back to the generic user label when username display is off', () => {
    renderSlot([{ steerId: 's1', text: 'anonymous words', status: 'pending', createdAt: 1 }], {
      usernameDisplay: false,
    });
    expect(screen.getByText('com_user_message')).toBeInTheDocument();
  });

  it('renders steer attachments', () => {
    renderSlot([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [
          { file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' },
          { file_id: 'f2', filename: 'shot.png', type: 'image/png', filepath: '/images/shot.png' },
        ],
      },
    ]);
    expect(screen.getByTestId('steer-file')).toHaveTextContent('notes.pdf');
    expect(screen.getByTestId('steer-image')).toBeInTheDocument();
  });

  it('opens the file preview dialog when a non-image steer attachment is clicked', () => {
    renderSlot([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }],
      },
    ]);
    expect(screen.queryByTestId('steer-file-preview')).toBeNull();

    fireEvent.click(screen.getByTestId('steer-file'));
    expect(screen.getByTestId('steer-file-preview')).toHaveTextContent('notes.pdf');
  });
});
