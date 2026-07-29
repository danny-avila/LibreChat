import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import type { QueuedMessage } from '~/store/families';
import PendingSteerChips from '../PendingSteerChips';
import store from '~/store';

const mockRemoveQueued = jest.fn();
const mockRestoreToComposer = jest.fn(() => true);
const mockEditToComposer = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const CONVO_ID = 'convo-q';

const steeringStub = () =>
  ({
    queueKey: CONVO_ID,
    defaultAction: 'steer',
    duringRunActive: false,
    canSteer: false,
    removeQueued: mockRemoveQueued,
    sendQueuedNow: jest.fn(),
    setDefaultAction: jest.fn(),
  }) as unknown as SteeringControls;

function renderChips(queued: QueuedMessage[]) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), queued);
      }}
    >
      <PendingSteerChips
        conversationId={CONVO_ID}
        steering={steeringStub()}
        onEditToComposer={mockEditToComposer}
        onRestoreToComposer={mockRestoreToComposer}
      />
    </RecoilRoot>,
  );
}

describe('PendingSteerChips — queued trash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the words to the composer before removing a queued message', () => {
    // The trash is non-destructive: it hands the text (and its carried context)
    // to the gated restore first, so the words are not gone forever.
    renderChips([
      {
        id: 'q1',
        text: 'later thought',
        createdAt: 1,
        quotes: ['a quote'],
        manualSkills: ['a-skill'],
      },
    ]);
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'later thought',
      undefined,
      { quotes: ['a quote'], manualSkills: ['a-skill'] },
      CONVO_ID,
    );
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  it('still removes the message even when the composer refuses the restore', () => {
    // Occupied composer / other chat: the gated restore returns false, but the
    // trash must reliably remove either way.
    mockRestoreToComposer.mockReturnValueOnce(false);
    renderChips([{ id: 'q2', text: 'drop me', createdAt: 1 }]);
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    expect(mockRestoreToComposer).toHaveBeenCalled();
    expect(mockRemoveQueued).toHaveBeenCalledWith('q2');
  });
});
