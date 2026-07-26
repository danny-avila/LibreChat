import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { QueuedMessage } from '~/store/families';
import Queue from '../Queue';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string>) =>
    options ? `${key}:${options['0']}` : key,
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

const queued = (over: Partial<QueuedMessage> = {}): QueuedMessage =>
  ({
    id: 'q1',
    text: 'follow up on this',
    files: [],
    quotes: [],
    manualSkills: [],
    ...over,
  }) as QueuedMessage;

function renderQueue(items: QueuedMessage[]) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.queuedMessagesByConvoId(CONVO_ID), items)}>
      <Queue
        steering={steering}
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
    renderQueue([queued()]);
    const row = screen.getByTestId('queued-message-row');
    expect(row).toBeInTheDocument();
    expect(screen.getByText('com_ui_send_now')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_edit_message')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_remove_queued')).toBeInTheDocument();
    expect(screen.queryByLabelText('com_ui_more_options')).not.toBeInTheDocument();
  });

  it('sends a row now', () => {
    renderQueue([queued()]);
    fireEvent.click(screen.getByText('com_ui_send_now'));
    expect(mockSendQueuedNow).toHaveBeenCalledTimes(1);
  });

  it('shows an attachment count when files ride along', () => {
    renderQueue([queued({ files: [{ file_id: 'f1' }, { file_id: 'f2' }] as never })]);
    expect(screen.getByText('com_ui_queued_attachment_count:2')).toBeInTheDocument();
  });
});
