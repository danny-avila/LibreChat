import React from 'react';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { render, screen, within, fireEvent } from '@testing-library/react';
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

const CONVO_ID = 'convo-1';
const mockSendQueuedNow = jest.fn();
const mockRemoveQueued = jest.fn();
const mockReorderQueued = jest.fn();

const steering = {
  queueKey: CONVO_ID,
  duringRunActive: true,
  canSteer: true,
  sendQueuedNow: mockSendQueuedNow,
  removeQueued: mockRemoveQueued,
  reorderQueued: mockReorderQueued,
} as unknown as SteeringControls;

const pausedSteering = { ...steering, canSteer: false } as unknown as SteeringControls;

const queued = (over: Partial<QueuedMessage> = {}): QueuedMessage =>
  ({
    id: 'q1',
    text: 'follow up on this',
    files: [],
    quotes: [],
    manualSkills: [],
    ...over,
  }) as QueuedMessage;

function renderQueue(items: QueuedMessage[], steeringOverride: SteeringControls = steering) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.queuedMessagesByConvoId(CONVO_ID), items)}>
      {/* Mirrors `App`, which mounts the provider around the whole tree. */}
      <DndProvider backend={HTML5Backend}>
        <Queue
          steering={steeringOverride}
          conversationId={CONVO_ID}
          onEditToComposer={jest.fn()}
          onRestoreToComposer={jest.fn()}
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

  it('renders a row per queued message with three visible actions', () => {
    renderQueue([queued({ id: 'q1' }), queued({ id: 'q2' })]);
    const rows = screen.getAllByTestId('queued-message-row');
    expect(rows).toHaveLength(2);

    const firstRow = within(rows[0]);
    expect(firstRow.getByText('com_ui_send_now')).toBeInTheDocument();
    expect(firstRow.getByLabelText('com_ui_edit_message')).toBeInTheDocument();
    expect(firstRow.getByLabelText('com_ui_remove_queued')).toBeInTheDocument();
    expect(firstRow.queryByLabelText('com_ui_more_options')).not.toBeInTheDocument();
  });

  it('sends a row now', () => {
    renderQueue([queued()]);
    fireEvent.click(screen.getByText('com_ui_send_now'));
    expect(mockSendQueuedNow).toHaveBeenCalledTimes(1);
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

  it('offers no handle when the only message has nowhere to go', () => {
    renderQueue([queued()]);
    expect(screen.queryByTestId('queued-message-grip')).not.toBeInTheDocument();
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
});
