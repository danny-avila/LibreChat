import React from 'react';
import { RecoilRoot } from 'recoil';
import { getDefaultStore } from 'jotai';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { escalatingSteerFamily } from '~/store/steer';
import PendingSteerChips from '../PendingSteerChips';
import store from '~/store';

const mockRemoveQueued = jest.fn();
const mockSendQueuedNow = jest.fn();
const mockRestoreToComposer = jest.fn(() => true);
const mockEditToComposer = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const CONVO_ID = 'convo-q';

const steeringStub = (overrides: Partial<SteeringControls> = {}) =>
  ({
    queueKey: CONVO_ID,
    defaultAction: 'steer',
    duringRunActive: false,
    canSteer: false,
    pausedOnApproval: false,
    removeQueued: mockRemoveQueued,
    sendQueuedNow: mockSendQueuedNow,
    setDefaultAction: jest.fn(),
    ...overrides,
  }) as unknown as SteeringControls;

function renderChips(
  queued: QueuedMessage[],
  options?: { steering?: Partial<SteeringControls>; steers?: PendingSteer[] },
) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), queued);
        if (options?.steers != null) {
          set(store.pendingSteersByConvoId(CONVO_ID), options.steers);
        }
      }}
    >
      <PendingSteerChips
        conversationId={CONVO_ID}
        steering={steeringStub(options?.steering)}
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

/**
 * The queued row's escalation: interrupt & steer this one message now, at the
 * next safe token boundary, instead of waiting for the run to end. Offered
 * only while a live run can accept a steer; disabled while another interrupt
 * is unresolved or the run is paused on approval, since a second preempt
 * would race the same seal (or draw the server's 409).
 */
describe('PendingSteerChips — queued interrupt-now', () => {
  const liveRun = { duringRunActive: true, canSteer: true };
  const queuedMessage: QueuedMessage = { id: 'q1', text: 'urgent one', createdAt: 1 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('escalates a queued message as an interrupt steer', () => {
    renderChips([queuedMessage], { steering: liveRun });
    fireEvent.click(screen.getByTestId('queued-interrupt-now'));

    expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), {
      preempt: true,
    });
  });

  it('offers no escalation outside a steerable run', () => {
    renderChips([queuedMessage]);
    expect(screen.queryByTestId('queued-interrupt-now')).toBeNull();
  });

  it('disables escalation while another interrupt is unresolved', () => {
    renderChips([queuedMessage], {
      steering: liveRun,
      steers: [{ steerId: 'p1', text: 'sealing', status: 'pending', createdAt: 1, preempt: true }],
    });
    const button = screen.getByTestId('queued-interrupt-now');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mockSendQueuedNow).not.toHaveBeenCalled();
  });

  it('disables escalation while a bubble arm request is in flight', () => {
    const jotai = getDefaultStore();
    act(() => {
      jotai.set(escalatingSteerFamily(CONVO_ID), true);
    });
    try {
      renderChips([queuedMessage], { steering: liveRun });
      expect(screen.getByTestId('queued-interrupt-now')).toBeDisabled();
    } finally {
      act(() => {
        jotai.set(escalatingSteerFamily(CONVO_ID), false);
      });
    }
  });

  it('stays visible but disabled while the run is paused on approval', () => {
    /** The real hook invariant: `canSteer = hasRealConvoId && !pausedOnApproval`,
     *  so a paused run always reads `canSteer: false`. The control must remain
     *  discoverable-but-disabled there, not vanish with the primary. */
    renderChips([queuedMessage], {
      steering: { duringRunActive: true, canSteer: false, pausedOnApproval: true },
    });
    const button = screen.getByTestId('queued-interrupt-now');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mockSendQueuedNow).not.toHaveBeenCalled();
  });

  it('offers the always-interrupt preference in the row menu and flips it', async () => {
    renderChips([queuedMessage], { steering: liveRun });
    fireEvent.click(screen.getByLabelText('com_ui_more_options'));
    fireEvent.click(await screen.findByText('com_ui_always_interrupt'));

    fireEvent.click(screen.getByLabelText('com_ui_more_options'));
    expect(await screen.findByText('com_ui_wait_for_tool_steps')).toBeInTheDocument();
  });
});
