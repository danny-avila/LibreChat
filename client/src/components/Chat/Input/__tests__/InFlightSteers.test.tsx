import React from 'react';
import { RecoilRoot } from 'recoil';
import { getDefaultStore } from 'jotai';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { PendingSteer } from '~/store/families';
import { steerOverlayHeightFamily } from '~/store/steer';
import InFlightSteers from '../InFlightSteers';
import store from '~/store';

const mockCancelMutateAsync = jest.fn();
const mockShowToast = jest.fn();
const mockQueueReclaimedSteer = jest.fn();
const mockRemoveSteer = jest.fn();
const mockSetDefaultAction = jest.fn();
const mockRestoreToComposer = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSteerCancel: jest.requireActual('~/hooks/Chat/useSteerCancel').default,
  useSteerReclaim: jest.requireActual('~/hooks/Chat/useSteerCancel').useSteerReclaim,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider', () => ({
  useCancelSteerMutation: () => ({ mutateAsync: mockCancelMutateAsync }),
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

const steeringStub = (defaultAction: 'steer' | 'queue' = 'steer') =>
  ({
    defaultAction,
    removeSteer: mockRemoveSteer,
    setDefaultAction: mockSetDefaultAction,
    queueReclaimedSteer: mockQueueReclaimedSteer,
  }) as unknown as SteeringControls;

function renderSteers(
  steers: PendingSteer[],
  options?: {
    enableUserMsgMarkdown?: boolean;
    appliedSteerIds?: string[];
    defaultAction?: 'steer' | 'queue';
  },
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
      <InFlightSteers
        conversationId={CONVO_ID}
        steering={steeringStub(options?.defaultAction)}
        onRestoreToComposer={mockRestoreToComposer}
      />
    </RecoilRoot>,
  );
}

/** Opens a bubble's "…" menu and clicks one of its items, flushing the reclaim
 *  round-trip the action awaits before it re-homes the text. */
async function clickMenuItem(label: string) {
  fireEvent.click(screen.getByLabelText('com_ui_more_options'));
  const item = await screen.findByText(label);
  await act(async () => {
    fireEvent.click(item);
  });
}

describe('InFlightSteers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCancelMutateAsync.mockResolvedValue({ removed: true });
    mockRestoreToComposer.mockReturnValue(true);
  });

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

  it('shows the menu at rest on every pointer, without hover-gating', () => {
    renderSteers([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
    ]);
    // The menu is the single control now (Cancel folded in), so a label-less ⋯
    // hidden until hover would be undiscoverable — and unreachable on touch,
    // where there is no hover. It must be visible at rest.
    const controls = screen.getByTestId('steer-controls');
    expect(controls.className).not.toContain('opacity-0');
    expect(screen.getByLabelText('com_ui_more_options')).toBeInTheDocument();
  });

  it('only offers the menu once the steer is acknowledged', () => {
    renderSteers([
      { steerId: 'local-1', text: 'still posting', status: 'sending', createdAt: 1 },
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 2 },
    ]);
    // A 'sending' entry has no server id yet, so there is nothing to act on —
    // cancel and the re-homing actions all need to reclaim it first.
    expect(screen.getAllByLabelText('com_ui_more_options')).toHaveLength(1);
  });

  it('cancels a pending steer from the menu and drops the bubble', async () => {
    renderSteers([
      { steerId: 's-ack', text: 'waiting on boundary', status: 'pending', createdAt: 1 },
    ]);
    await clickMenuItem('com_ui_steer_cancel');

    expect(mockCancelMutateAsync).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      steerId: 's-ack',
    });
    await act(async () => {});
    expect(screen.queryByText('waiting on boundary')).toBeNull();
  });

  it('hands the words back to the composer once the cancel reclaims them', async () => {
    // Cancel is non-destructive: on a `reclaimed` outcome (removed:true) the
    // steer never reached the run, so its words return to the composer (the
    // gated restore refuses on its own when the composer is occupied).
    mockCancelMutateAsync.mockResolvedValue({ removed: true });
    renderSteers([{ steerId: 's-ack', text: 'second thoughts', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_steer_cancel');
    await act(async () => {});
    expect(mockRestoreToComposer).toHaveBeenCalledWith('second thoughts', undefined, {}, CONVO_ID);
  });

  it('queues the words when cancel reclaims but the composer refuses the restore', async () => {
    // Reclaimed (removed:true) yet the composer moved on, so the gated restore
    // refuses. The chip is already gone — queue the words like Edit rather than
    // drop them.
    mockCancelMutateAsync.mockResolvedValue({ removed: true });
    mockRestoreToComposer.mockReturnValue(false);
    const steer: PendingSteer = {
      steerId: 's-ack',
      text: 'keep me',
      status: 'pending',
      createdAt: 1,
    };
    renderSteers([steer]);
    await clickMenuItem('com_ui_steer_cancel');
    await act(async () => {});
    expect(mockQueueReclaimedSteer).toHaveBeenCalledWith(steer);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_edit_queued' }),
    );
  });

  it('does not restore when the cancel loses its race (steer already reached the run)', async () => {
    // removed:false → the steer will still inject; restoring would put the same
    // words in the composer alongside the copy in the response.
    mockCancelMutateAsync.mockResolvedValue({ removed: false });
    renderSteers([{ steerId: 's-ack', text: 'too late', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_steer_cancel');
    await act(async () => {});
    expect(mockRestoreToComposer).not.toHaveBeenCalled();
    // The chip still left optimistically; the events own the outcome.
    expect(mockCancelMutateAsync).toHaveBeenCalled();
  });

  it('does not restore when the cancel POST fails', async () => {
    // The POST failed, so the server may still inject it and the bubble is
    // restored — restoring to the composer too would duplicate the words.
    mockCancelMutateAsync.mockRejectedValue(new Error('network'));
    renderSteers([{ steerId: 's-ack', text: 'unknown fate', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_steer_cancel');
    await act(async () => {});
    expect(mockRestoreToComposer).not.toHaveBeenCalled();
  });

  it('restores the bubble when the cancel POST fails', async () => {
    mockCancelMutateAsync.mockRejectedValue(new Error('network'));
    renderSteers([{ steerId: 's-err', text: 'network flake', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_steer_cancel');
    // Optimistic remove, then the reject restores it.
    await act(async () => {});
    expect(screen.getByText('network flake')).toBeInTheDocument();
  });

  it('does not restore a steer that settled while the cancel POST was in flight', async () => {
    // The run's final event converted this steer to a queued follow-up, which
    // stamps its id into the applied set. Restoring it on a failed cancel would
    // strand a stale entry that the NEXT run — a queue drain auto-sends one —
    // renders as an in-flight bubble beside that queued copy.
    mockCancelMutateAsync.mockRejectedValue(new Error('network'));
    renderSteers(
      [{ steerId: 's-settled', text: 'already queued', status: 'pending', createdAt: 1 }],
      { appliedSteerIds: ['s-settled'] },
    );
    await clickMenuItem('com_ui_steer_cancel');
    await act(async () => {});
    expect(screen.queryByText('already queued')).toBeNull();
  });

  it('reclaims a pending steer before queueing it for after the response', async () => {
    const steer: PendingSteer = {
      steerId: 's-ack',
      text: 'do this after',
      status: 'pending',
      createdAt: 1,
    };
    renderSteers([steer]);
    await clickMenuItem('com_ui_convert_to_queue');

    // Reclaim first: the server would otherwise still inject the steer, and the
    // queued copy would say the same words a second time.
    expect(mockCancelMutateAsync).toHaveBeenCalledWith({
      conversationId: CONVO_ID,
      steerId: 's-ack',
    });
    // Routed through the shared conversion, which preserves the steer's id and
    // createdAt so it drains ahead of a follow-up queued after it.
    expect(mockQueueReclaimedSteer).toHaveBeenCalledWith(steer);
  });

  it('hands the whole steer to the conversion so attachments and context survive', async () => {
    const steer: PendingSteer = {
      steerId: 's-ack',
      text: 'see notes',
      status: 'pending',
      createdAt: 1,
      files: [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }],
      quotes: ['quoted line'],
      manualSkills: ['skill-1'],
    };
    renderSteers([steer]);
    await clickMenuItem('com_ui_convert_to_queue');

    expect(mockQueueReclaimedSteer).toHaveBeenCalledWith(steer);
  });

  it('reclaims a pending steer before editing it back into the composer', async () => {
    const files = [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }];
    renderSteers([
      {
        steerId: 's-ack',
        text: 'reword this',
        status: 'pending',
        createdAt: 1,
        files,
        quotes: ['quoted line'],
      },
    ]);
    await clickMenuItem('com_ui_edit_message');

    // The origin conversation rides along so a restore cannot land in whatever
    // chat the user navigated to while the reclaim was in flight.
    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'reword this',
      files,
      { quotes: ['quoted line'] },
      CONVO_ID,
    );
    expect(mockRemoveSteer).toHaveBeenCalledWith('s-ack');
  });

  it('queues a reclaimed steer instead of overwriting a composer that moved on', async () => {
    // The reclaim is a round-trip: the user can type a new draft (or navigate)
    // before it resolves. The words are already off the server, so neither the
    // steer nor the newer draft is the one to throw away.
    mockRestoreToComposer.mockReturnValue(false);
    const steer: PendingSteer = {
      steerId: 's-ack',
      text: 'reword this',
      status: 'pending',
      createdAt: 1,
    };
    renderSteers([steer]);
    await clickMenuItem('com_ui_edit_message');

    expect(mockQueueReclaimedSteer).toHaveBeenCalledWith(steer);
    expect(mockRemoveSteer).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_edit_queued' }),
    );
  });

  it('does not restore a steer a terminal conversion already queued', async () => {
    // The chip stays interactive during the reclaim round-trip, so a run that
    // ends or errors meanwhile converts it to a queued follow-up (stamping the
    // applied set). Restoring afterwards would leave one copy queued and
    // another in the composer draft.
    renderSteers([{ steerId: 's-ack', text: 'already queued', status: 'pending', createdAt: 1 }], {
      appliedSteerIds: ['s-ack'],
    });
    await clickMenuItem('com_ui_edit_message');

    expect(mockRestoreToComposer).not.toHaveBeenCalled();
    expect(mockQueueReclaimedSteer).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_run_ended_queued' }),
    );
  });

  it('never re-homes a steer the server already applied', async () => {
    // `removed: false` means the cancel lost its race to the injection
    // boundary: the words are in the run, so queueing them would send twice.
    mockCancelMutateAsync.mockResolvedValue({ removed: false });
    renderSteers([{ steerId: 's-ack', text: 'too late', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_convert_to_queue');

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_already_applied' }),
    );
    expect(mockQueueReclaimedSteer).not.toHaveBeenCalled();
  });

  it('never re-homes a steer whose cancel failed', async () => {
    // The POST failed, so the server may still inject it — its fate is unknown,
    // so the bubble stays and the text must not also land in the composer.
    mockCancelMutateAsync.mockRejectedValue(new Error('network'));
    renderSteers([{ steerId: 's-ack', text: 'unknown fate', status: 'pending', createdAt: 1 }]);
    await clickMenuItem('com_ui_edit_message');

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_cancel_failed', status: 'error' }),
    );
    expect(mockRestoreToComposer).not.toHaveBeenCalled();
    expect(mockQueueReclaimedSteer).not.toHaveBeenCalled();
    // The menu actions leave the chip alone until the outcome is known.
    expect(screen.getByText('unknown fate')).toBeInTheDocument();
  });

  it('offers the mode toggle as the action the user would switch to', async () => {
    renderSteers([{ steerId: 's-ack', text: 'waiting', status: 'pending', createdAt: 1 }], {
      defaultAction: 'steer',
    });
    await clickMenuItem('com_ui_turn_on_queueing');
    expect(mockSetDefaultAction).toHaveBeenCalledWith('queue');
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
          <InFlightSteers
            conversationId={CONVO_ID}
            steering={steeringStub()}
            onRestoreToComposer={mockRestoreToComposer}
          />
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

  it('floats the stack over the thread instead of displacing it', () => {
    // Anchored above the composer and pulled out of flow so the messages keep
    // their full height and slide behind it when the user scrolls up.
    renderSteers([{ steerId: 's1', text: 'scroll behind me', status: 'pending', createdAt: 1 }]);
    const stack = screen.getByTestId('in-flight-steers');
    expect(stack.className).toContain('absolute');
    expect(stack.className).toContain('bottom-full');
    // Wheeling over the gaps must reach the messages behind; bubbles opt back in.
    expect(stack.className).toContain('pointer-events-none');
    expect(screen.getByTestId('in-flight-steer').className).toContain('pointer-events-auto');
  });

  it('offers show more for a long steer and expands it in place', () => {
    // jsdom does no layout, so stub scrollHeight above the collapse cap (128px)
    // to make the content read as overflowing.
    const scrollHeight = jest
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(500);
    try {
      renderSteers([
        { steerId: 's1', text: 'paragraph\n\n'.repeat(20), status: 'pending', createdAt: 1 },
      ]);
      const toggle = screen.getByRole('button', { name: 'com_ui_show_more' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      const collapse = screen.getByRole('button', { name: 'com_ui_show_less' });
      expect(collapse).toHaveAttribute('aria-expanded', 'true');
    } finally {
      scrollHeight.mockRestore();
    }
  });

  it('does not offer a toggle for a steer that fits the preview', () => {
    // Left unstubbed, jsdom scrollHeight is 0, i.e. never overflows.
    renderSteers([{ steerId: 's1', text: 'thank you', status: 'pending', createdAt: 1 }]);
    expect(screen.queryByRole('button', { name: 'com_ui_show_more' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'com_ui_show_less' })).toBeNull();
  });

  it('sticks the options menu so it stays reachable while scrolling long content', () => {
    renderSteers([{ steerId: 's1', text: 'x'.repeat(4000), status: 'pending', createdAt: 1 }]);
    expect(screen.getByTestId('steer-controls').className).toContain('sticky');
  });

  it('publishes its height for the messages to reserve, and clears it on unmount', () => {
    // The overlay no longer takes layout space, so it hands its measured height
    // to `steerOverlayHeightFamily`; `MessagesView` reserves an equal band of
    // bottom padding so the newest message rests clear of it.
    const jotaiStore = getDefaultStore();
    const offsetHeight = jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(96);
    try {
      const { unmount } = renderSteers([
        { steerId: 's1', text: 'reserve for me', status: 'pending', createdAt: 1 },
      ]);
      expect(jotaiStore.get(steerOverlayHeightFamily(CONVO_ID))).toBe(96);
      unmount();
      expect(jotaiStore.get(steerOverlayHeightFamily(CONVO_ID))).toBe(0);
    } finally {
      offsetHeight.mockRestore();
    }
  });
});
