import React from 'react';
import { RecoilRoot } from 'recoil';
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

const steering = {
  queueKey: CONVO_ID,
  duringRunActive: true,
  canSteer: true,
  sendQueuedNow: mockSendQueuedNow,
  removeQueued: mockRemoveQueued,
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
      <Queue
        steering={steeringOverride}
        conversationId={CONVO_ID}
        onEditToComposer={jest.fn()}
        onRestoreToComposer={jest.fn()}
      />
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
