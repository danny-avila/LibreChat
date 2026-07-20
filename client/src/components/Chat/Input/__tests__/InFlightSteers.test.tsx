import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PendingSteer } from '~/store/families';
import InFlightSteers from '../InFlightSteers';
import store from '~/store';

const mockCancelMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSteerCancel: jest.requireActual('~/hooks/Chat/useSteerCancel').default,
}));

jest.mock('~/data-provider', () => ({
  useCancelSteerMutation: () => ({ mutate: mockCancelMutate }),
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: ({ file, onClick }: { file: { filename?: string }; onClick?: () => void }) => (
    <button type="button" data-testid="steer-file" onClick={onClick}>
      {file.filename}
    </button>
  ),
}));

/** The composer thumbnail path: a fixed-size button painted with a background
 *  image, not an <img> — assert on the url it was handed. */
jest.mock('~/components/Chat/Input/Files/ImagePreview', () => ({
  __esModule: true,
  default: ({ url, alt }: { url?: string; alt?: string }) => (
    <button type="button" data-testid="steer-image" data-url={url} aria-label={alt} />
  ),
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileName }: { open: boolean; fileName: string }) =>
    open ? <div data-testid="steer-file-preview">{fileName}</div> : null,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content, codeExecution }: { content: string; codeExecution?: boolean }) => (
    <span data-testid="steer-markdown" data-code-execution={String(codeExecution)}>
      {content}
    </span>
  ),
}));

const CONVO_ID = 'convo-in-flight';

function renderSteers(
  steers: PendingSteer[],
  options?: { enableUserMsgMarkdown?: boolean; appliedSteerIds?: string[] },
) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), steers);
        if (options?.appliedSteerIds != null) {
          set(store.appliedSteerIdsByConvoId(CONVO_ID), options.appliedSteerIds);
        }
        if (options?.enableUserMsgMarkdown != null) {
          set(store.enableUserMsgMarkdown, options.enableUserMsgMarkdown);
        }
      }}
    >
      <InFlightSteers conversationId={CONVO_ID} />
    </RecoilRoot>,
  );
}

describe('InFlightSteers', () => {
  it('renders nothing when no steer is in flight', () => {
    renderSteers([]);
    expect(screen.queryByTestId('in-flight-steers')).toBeNull();
  });

  it('anchors sending and pending steers above the composer, not in-thread', () => {
    renderSteers([
      { steerId: 's1', text: 'first correction', status: 'sending', createdAt: 1 },
      { steerId: 's2', text: 'second correction', status: 'pending', createdAt: 2 },
    ]);
    expect(screen.getAllByTestId('in-flight-steer')).toHaveLength(2);
    expect(screen.getByText('first correction')).toBeInTheDocument();
    expect(screen.getByText('second correction')).toBeInTheDocument();
    // The in-thread SteerPart is reserved for server-applied steers.
    expect(screen.queryByTestId('steer-part')).toBeNull();
  });

  it('leaves failed steers to the composer recovery rows', () => {
    renderSteers([{ steerId: 's3', text: 'never sent', status: 'failed', createdAt: 1 }]);
    expect(screen.queryByTestId('in-flight-steers')).toBeNull();
  });

  it('keeps cancel reachable on touch, hover-revealed on hover-capable pointers', () => {
    renderSteers([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
    ]);
    // A plain `opacity-0` reveal would make the bubble hover-dependent, so on
    // touch the X would need a first tap to appear (see the #14272 pattern).
    const cancel = screen.getByTestId('steer-cancel');
    expect(cancel.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(cancel.className).toContain('group-hover:opacity-100');
    expect(cancel.className).toContain('focus-visible:opacity-100');
  });

  it('only offers cancel once the steer is acknowledged', () => {
    renderSteers([
      { steerId: 'local-1', text: 'still posting', status: 'sending', createdAt: 1 },
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 2 },
    ]);
    // A 'sending' entry has no server id yet, so there is nothing to cancel.
    expect(screen.getAllByTestId('steer-cancel')).toHaveLength(1);
  });

  it('cancels a pending steer server-side and drops the bubble', () => {
    renderSteers([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
    ]);
    fireEvent.click(screen.getByTestId('steer-cancel'));

    expect(mockCancelMutate).toHaveBeenCalledWith(
      { conversationId: CONVO_ID, steerId: 's-ack' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(screen.queryByText('waiting on boundary')).toBeNull();
  });

  it('restores the bubble when the cancel POST fails', () => {
    renderSteers([{ steerId: 's-err', text: 'network flake', status: 'pending', createdAt: 1 }]);
    fireEvent.click(screen.getByTestId('steer-cancel'));
    expect(screen.queryByText('network flake')).toBeNull();

    const options = mockCancelMutate.mock.calls[0][1] as { onError: () => void };
    act(() => options.onError());
    expect(screen.getByText('network flake')).toBeInTheDocument();
  });

  it('does not restore a steer that settled while the cancel POST was in flight', () => {
    // The run's final event converted this steer to a queued follow-up, which
    // stamps its id into the applied set. Restoring it on a failed cancel would
    // strand a stale entry that the NEXT run — a queue drain auto-sends one —
    // renders as an in-flight bubble beside that queued copy.
    renderSteers(
      [{ steerId: 's-settled', text: 'already queued', status: 'pending', createdAt: 1 }],
      { appliedSteerIds: ['s-settled'] },
    );
    fireEvent.click(screen.getByTestId('steer-cancel'));
    expect(screen.queryByText('already queued')).toBeNull();

    const options = mockCancelMutate.mock.calls[0][1] as { onError: () => void };
    act(() => options.onError());
    expect(screen.queryByText('already queued')).toBeNull();
  });

  it('renders images through the composer thumbnail path, not the full-size message image', () => {
    renderSteers([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [
          { file_id: 'f2', filename: 'shot.png', type: 'image/png', filepath: '/images/shot.png' },
        ],
      },
    ]);
    // The message `Image` reserves height from the file's dimensions, so it
    // cannot be clipped down to a thumbnail; ImagePreview is fixed-size.
    expect(screen.getByTestId('steer-image')).toHaveAttribute('data-url', '/images/shot.png');
  });

  it('prefers the local preview url for an image that is still uploading', () => {
    renderSteers([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [
          {
            file_id: 'f2',
            filename: 'shot.png',
            type: 'image/png',
            preview: 'blob:local-preview',
            filepath: '/images/shot.png',
          },
        ],
      },
    ]);
    expect(screen.getByTestId('steer-image')).toHaveAttribute('data-url', 'blob:local-preview');
  });

  it('keeps non-image attachments previewable while the steer waits', () => {
    renderSteers([
      {
        steerId: 's1',
        text: 'see attached',
        status: 'pending',
        createdAt: 1,
        files: [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }],
      },
    ]);
    expect(screen.getByTestId('steer-file')).toHaveTextContent('notes.pdf');
    expect(screen.queryByTestId('steer-file-preview')).toBeNull();

    fireEvent.click(screen.getByTestId('steer-file'));
    expect(screen.getByTestId('steer-file-preview')).toHaveTextContent('notes.pdf');
  });

  it('renders markdown the same way the applied part will, so text does not reflow on apply', () => {
    renderSteers([{ steerId: 's1', text: '**bold** steer', status: 'pending', createdAt: 1 }], {
      enableUserMsgMarkdown: true,
    });
    expect(screen.getByTestId('steer-markdown')).toHaveTextContent('**bold** steer');
  });

  it('disables code execution: the bubble has no message/part for Run Code to target', () => {
    renderSteers([{ steerId: 's1', text: '```js\nrun()\n```', status: 'pending', createdAt: 1 }], {
      enableUserMsgMarkdown: true,
    });
    // This component renders outside MessageContext, so an executable code
    // block would fire the tool mutation with no messageId/conversationId.
    expect(screen.getByTestId('steer-markdown')).toHaveAttribute('data-code-execution', 'false');
  });

  it('keeps the newest steer in view when the capped stack overflows', () => {
    // jsdom does no layout, so scrollHeight is 0 unless stubbed — without it
    // the assertion would pass vacuously against a scrollTop of 0.
    const scrollHeight = jest
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(600);
    try {
      const { rerender } = renderSteers([
        { steerId: 's1', text: 'first', status: 'pending', createdAt: 1 },
      ]);
      // A newly submitted steer appends BELOW the existing ones, so a stack
      // left scrolled to the top would hide it and its cancel control.
      rerender(
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.pendingSteersByConvoId(CONVO_ID), [
              { steerId: 's1', text: 'first', status: 'pending', createdAt: 1 },
              { steerId: 's2', text: 'just submitted', status: 'pending', createdAt: 2 },
            ]);
          }}
        >
          <InFlightSteers conversationId={CONVO_ID} />
        </RecoilRoot>,
      );
      expect(screen.getByTestId('in-flight-steers').scrollTop).toBe(600);
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('caps the stack so a long steer cannot push the composer off-screen', () => {
    renderSteers([{ steerId: 's1', text: 'x'.repeat(4000), status: 'pending', createdAt: 1 }]);
    // A steer runs to 16k chars, and a run takes up to 10 of them.
    const stack = screen.getByTestId('in-flight-steers');
    expect(stack.className).toContain('max-h-[35vh]');
    expect(stack.className).toContain('overflow-y-auto');
  });

  it('renders raw text when user-message markdown is off', () => {
    renderSteers([{ steerId: 's1', text: '**bold** steer', status: 'pending', createdAt: 1 }], {
      enableUserMsgMarkdown: false,
    });
    expect(screen.queryByTestId('steer-markdown')).toBeNull();
    expect(screen.getByText('**bold** steer')).toBeInTheDocument();
  });
});
