import React from 'react';
import { DndProvider } from 'react-dnd';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { QueuedMessage } from '~/store/families';
import Queue from '../Queue';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) {
      return key;
    }
    const value = options.count ?? options['0'];
    return `${key}:${value}`;
  },
}));

const mockShowToast = jest.fn();
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

const CONVO_ID = 'convo-1';
const mockSendQueuedNow = jest.fn();
const mockRemoveQueued = jest.fn();
const mockReorderQueued = jest.fn();
const mockRestoreQueuedOrder = jest.fn();

/** Only what the rail reads, filled out against the real type so a change to
 *  the contract breaks compilation rather than passing quietly. */
const steeringWith = (over: Partial<SteeringControls> = {}): SteeringControls =>
  ({
    queueKey: CONVO_ID,
    duringRunActive: true,
    canSteer: true,
    sendQueuedNow: mockSendQueuedNow,
    removeQueued: mockRemoveQueued,
    reorderQueued: mockReorderQueued,
    restoreQueuedOrder: mockRestoreQueuedOrder,
    ...over,
  }) as SteeringControls;

const steering = steeringWith();
const pausedSteering = steeringWith({ canSteer: false });
/** Paused on a tool approval: steering is unavailable, but the escalation
 *  control stays visible-and-disabled rather than vanishing mid-pause. */
const approvalPausedSteering = steeringWith({ canSteer: false, pausedOnApproval: true });

const queued = (over: Partial<QueuedMessage> = {}): QueuedMessage =>
  ({
    id: 'q1',
    text: 'follow up on this',
    files: [],
    quotes: [],
    manualSkills: [],
    ...over,
  }) as QueuedMessage;

function renderQueue(
  items: QueuedMessage[],
  steeringOverride: SteeringControls = steering,
  handlers: {
    onEditToComposer?: jest.Mock;
    onRestoreToComposer?: jest.Mock;
  } = {},
) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.queuedMessagesByConvoId(CONVO_ID), items)}>
      {/* Mirrors `App`, which mounts the provider around the whole tree. */}
      <DndProvider backend={HTML5Backend}>
        <Queue
          steering={steeringOverride}
          conversationId={CONVO_ID}
          onEditToComposer={handlers.onEditToComposer ?? jest.fn()}
          onRestoreToComposer={handlers.onRestoreToComposer ?? jest.fn()}
        />
      </DndProvider>
    </RecoilRoot>,
  );
}

describe('Queue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when the queue is empty', () => {
    const { container } = renderQueue([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a row per queued message with every action visible, none behind a menu', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    const rows = screen.getAllByTestId('queued-message-row');
    expect(rows).toHaveLength(2);

    const firstRow = within(rows[0]);
    expect(firstRow.getByText('com_ui_send_now')).toBeInTheDocument();
    expect(firstRow.getByTestId('queued-interrupt-now')).toBeInTheDocument();
    expect(firstRow.getByLabelText('com_ui_edit_message')).toBeInTheDocument();
    expect(firstRow.getByLabelText('com_ui_remove_queued')).toBeInTheDocument();
    expect(firstRow.queryByLabelText('com_ui_more_options')).not.toBeInTheDocument();
  });

  it('sends the row that was clicked, not the first one', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2', text: 'the second one' })]);
    fireEvent.click(screen.getAllByText('com_ui_send_now')[1]);
    expect(mockSendQueuedNow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q2', text: 'the second one' }),
    );
  });

  it('disables send now while the run is paused on approval', () => {
    renderQueue([queued()], pausedSteering);
    const sendButton = screen.getByText('com_ui_send_now');
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('title', 'com_ui_send_now_paused');

    fireEvent.click(sendButton);
    expect(mockSendQueuedNow).not.toHaveBeenCalled();
  });

  it('moves a message down the queue with the arrow keys', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    const grips = screen.getAllByTestId('queued-message-grip');

    fireEvent.keyDown(grips[0], { key: 'ArrowDown' });
    expect(mockReorderQueued).toHaveBeenCalledWith('q1', 1);

    fireEvent.keyDown(grips[1], { key: 'ArrowUp' });
    expect(mockReorderQueued).toHaveBeenCalledWith('q2', 0);
  });

  it('refuses to move a message past either end of the queue', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    const grips = screen.getAllByTestId('queued-message-grip');

    fireEvent.keyDown(grips[0], { key: 'ArrowUp' });
    fireEvent.keyDown(grips[1], { key: 'ArrowDown' });
    expect(mockReorderQueued).not.toHaveBeenCalled();
  });

  it('announces where a moved message landed', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    fireEvent.keyDown(screen.getAllByTestId('queued-message-grip')[0], { key: 'ArrowDown' });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_queue_moved:2');
  });

  /* Swapping the handle out from under a keyboard user is how focus gets
     dropped to the top of the page when a drain shrinks the queue. */
  it('keeps the handle when the only message has nowhere to go, and refuses to move it', () => {
    renderQueue([queued()]);
    const grip = screen.getByTestId('queued-message-grip');
    expect(grip).toHaveAttribute('aria-disabled', 'true');

    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    expect(mockReorderQueued).not.toHaveBeenCalled();
  });

  it('keeps the live region and the hint out of the list itself', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    const list = screen.getByTestId('composer-queue');
    expect(within(list).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    /* Every child of the list is one of its items. */
    for (const child of Array.from(list.children)) {
      expect(child).toHaveAttribute('role', 'listitem');
    }
  });

  it('returns a trashed message to the composer before dropping it', () => {
    const onRestore = jest.fn().mockReturnValue(true);
    renderQueue([queued({ id: 'q1', files: [{ file_id: 'f1' }] as never })], steering, {
      onRestoreToComposer: onRestore,
    });
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));
    expect(onRestore).toHaveBeenCalledWith(
      'follow up on this',
      [{ file_id: 'f1' }],
      { quotes: [], manualSkills: [] },
      CONVO_ID,
    );
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  /* The composer refuses when it is occupied or the user has moved on. Dropping
     the message anyway is the only path here that can destroy text outright. */
  it('keeps the message queued when the composer refuses to take it back', () => {
    const onRestore = jest.fn().mockReturnValue(false);
    renderQueue([queued({ id: 'q1' })], steering, { onRestoreToComposer: onRestore });
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));
    expect(onRestore).toHaveBeenCalled();
    expect(mockRemoveQueued).not.toHaveBeenCalled();
    /* Keeping the words is right; saying nothing about it is not. Without this
       the row simply does not react and the button reads as broken. */
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_queue_remove_blocked' }),
    );
  });

  it('hands the whole message to the composer to edit', () => {
    const onEdit = jest.fn().mockReturnValue(true);
    renderQueue([queued({ id: 'q1', quotes: ['a quote'], manualSkills: ['writer'] })], steering, {
      onEditToComposer: onEdit,
    });
    fireEvent.click(screen.getByLabelText('com_ui_edit_message'));
    expect(onEdit).toHaveBeenCalledWith('follow up on this', [], {
      quotes: ['a quote'],
      manualSkills: ['writer'],
    });
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  /* Edit used to drop the row first and hand the words over second, so a
     composer that refuses — a paused question owns it — destroyed the message
     outright. Same restore-then-remove order as the trash. */
  it('keeps the message queued when the composer refuses to take it for editing', () => {
    const onEdit = jest.fn().mockReturnValue(false);
    renderQueue([queued({ id: 'q1' })], steering, { onEditToComposer: onEdit });
    fireEvent.click(screen.getByLabelText('com_ui_edit_message'));
    expect(onEdit).toHaveBeenCalled();
    expect(mockRemoveQueued).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_queue_edit_blocked' }),
    );
  });

  /* The region is removed with the rail and re-inserted with its old text
     still in it, which readers announce on insertion. */
  it('forgets its last announcement once the queue empties', () => {
    let setQueue: (items: QueuedMessage[]) => void = () => undefined;
    const Driver = () => {
      setQueue = useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID));
      return null;
    };
    render(
      <RecoilRoot
        initializeState={({ set }) =>
          set(store.queuedMessagesByConvoId(CONVO_ID), [queued({ id: 'q1' }), queued({ id: 'q2' })])
        }
      >
        <Driver />
        <DndProvider backend={HTML5Backend}>
          <Queue
            steering={steering}
            conversationId={CONVO_ID}
            onEditToComposer={jest.fn()}
            onRestoreToComposer={jest.fn()}
          />
        </DndProvider>
      </RecoilRoot>,
    );

    fireEvent.keyDown(screen.getAllByTestId('queued-message-grip')[0], { key: 'ArrowDown' });
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_queue_moved:2');

    act(() => setQueue([]));
    act(() => setQueue([queued({ id: 'q3', text: 'a new message' })]));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  /* The rows move as the pointer crosses them, so the queue has already changed
     by the time a drag ends. Only a drag that never landed anywhere puts it
     back — and `didDrop` reports a landing even though the rows declare no
     `drop` handler, which is what makes the plain `hover` sortable work. */
  describe('drag reordering', () => {
    /* The handle only drags on a hover-capable pointer, and the suite's
       `matchMedia` answers `false` to everything — which is the touch device
       the rail deliberately refuses to drag on. */
    const realMatchMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) =>
        ({
          matches: query === '(hover: hover)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }) as unknown as MediaQueryList) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = realMatchMedia;
    });

    /* jsdom has no DataTransfer, and the HTML5 backend reads one off every
       event it handles. */
    const dataTransfer = () => ({
      dropEffect: 'move',
      effectAllowed: 'move',
      files: [],
      items: [],
      types: [],
      setData: () => undefined,
      getData: () => '',
      setDragImage: () => undefined,
    });

    const dragFirstRowOntoSecond = (drop: boolean) => {
      renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
      const grip = screen.getAllByTestId('queued-message-grip')[0];
      const secondRow = screen.getAllByTestId('queued-message-row')[1];
      const dt = dataTransfer();

      fireEvent.dragStart(grip, { dataTransfer: dt });
      fireEvent.dragOver(secondRow, { dataTransfer: dt });
      if (drop) {
        fireEvent.drop(secondRow, { dataTransfer: dt });
      }
      fireEvent.dragEnd(grip, { dataTransfer: dt });
    };

    it('keeps the new order when the drag is dropped on the rail', () => {
      dragFirstRowOntoSecond(true);
      expect(mockRestoreQueuedOrder).not.toHaveBeenCalled();
    });

    it('puts the order back when the drag is abandoned', () => {
      dragFirstRowOntoSecond(false);
      expect(mockRestoreQueuedOrder).toHaveBeenCalledWith(['q1', 'q2']);
    });
  });

  it('shows an attachment count when files ride along', () => {
    renderQueue([queued({ files: [{ file_id: 'f1' }, { file_id: 'f2' }] as never })]);
    const attachmentLabel = screen.getByText('com_ui_attachment_count:2');
    expect(attachmentLabel).toBeInTheDocument();
    expect(attachmentLabel.parentElement).toHaveAttribute(
      'title',
      'com_ui_queued_attachment_count:2',
    );
    expect(attachmentLabel.parentElement).not.toHaveAttribute('aria-label');
    expect(screen.getByText('com_ui_queued_attachment_count:2')).toHaveClass('sr-only');
  });

  /* Escalation is the only way to make a waiting message interrupt the reply
     rather than wait for its next tool step. Send now sends it as an ordinary
     steer; this sends it as an interrupt. */
  describe('interrupt escalation', () => {
    it('escalates the row that was clicked, as a preempt', () => {
      renderQueue([queued({ id: 'q1' }), queued({ id: 'q2', text: 'the second one' })]);
      fireEvent.click(screen.getAllByTestId('queued-interrupt-now')[1]);
      expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }), {
        preempt: true,
      });
    });

    it('leaves Send now as an ordinary steer', () => {
      renderQueue([queued({ id: 'q1' })]);
      fireEvent.click(screen.getByText('com_ui_send_now'));
      expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }));
    });

    /* Hiding it during the pause is the discoverability gap this button
       closes: the pause is exactly when a user wants to cut the reply short. */
    it('stays visible but disabled while paused on an approval', () => {
      renderQueue([queued()], approvalPausedSteering);
      expect(screen.getByTestId('queued-interrupt-now')).toBeDisabled();
    });

    /* The drain starts the next run before its epoch lands, so a control that
       hid itself here would appear and vanish between queued sends. */
    it('stays visible but disabled before the generation epoch lands', () => {
      renderQueue([queued()], steeringWith({ canSteer: false }));
      expect(screen.getByTestId('queued-interrupt-now')).toBeDisabled();
    });

    it('offers nothing once the run is over', () => {
      renderQueue([queued()], steeringWith({ duringRunActive: false, canSteer: false }));
      expect(screen.queryByTestId('queued-interrupt-now')).not.toBeInTheDocument();
    });

    /* A recovered row is consumed atomically only by a normal generation, so
       escalating it would leave or duplicate its parked server copy. */
    it('offers nothing on a recovered row', () => {
      renderQueue([queued({ recoverySteerId: 'srv-1' })]);
      expect(screen.queryByTestId('queued-interrupt-now')).not.toBeInTheDocument();
    });
  });
});
