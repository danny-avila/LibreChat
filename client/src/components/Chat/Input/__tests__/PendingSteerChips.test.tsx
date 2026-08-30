import React from 'react';
import { getDefaultStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { PendingSteer, QueuedMessage } from '~/store/families';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { escalatingSteerFamily } from '~/store/steer';
import PendingSteerChips from '../PendingSteerChips';
import store from '~/store';

const mockRemoveQueued = jest.fn();
const mockDiscardQueued = jest.fn(async (_message: QueuedMessage) => true);
const mockSendQueuedNow = jest.fn();
const mockRetrySteer = jest.fn();
const mockRestoreToComposer = jest.fn(() => true);
const mockEditToComposer = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const CONVO_ID = 'convo-q';
let updateQueueForTest:
  | ((updater: (current: QueuedMessage[]) => QueuedMessage[]) => void)
  | undefined;

function QueueState() {
  const queue = useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID));
  const setQueue = useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID));
  updateQueueForTest = (updater) => setQueue(updater);
  return <output data-testid="queue-state">{JSON.stringify(queue)}</output>;
}

function PreferenceState() {
  const defaultAction = useRecoilValue(store.duringRunDefaultAction);
  const interrupts = useRecoilValue(store.steerInterruptsByDefault);
  return (
    <>
      <output data-testid="default-action-state">{defaultAction}</output>
      <output data-testid="interrupts-state">{String(interrupts)}</output>
    </>
  );
}

const steeringStub = (overrides: Partial<SteeringControls> = {}) =>
  ({
    queueKey: CONVO_ID,
    defaultAction: 'steer',
    duringRunActive: false,
    canSendQueuedNow: true,
    canSteer: false,
    pausedOnApproval: false,
    removeQueued: mockRemoveQueued,
    discardQueued: mockDiscardQueued,
    sendQueuedNow: mockSendQueuedNow,
    retrySteer: mockRetrySteer,
    setDefaultAction: jest.fn(),
    ...overrides,
  }) as unknown as SteeringControls;

function renderChips(
  queued: QueuedMessage[],
  options?: {
    steering?: Partial<SteeringControls>;
    steers?: PendingSteer[];
    interrupts?: boolean;
  },
) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), queued);
        set(store.duringRunDefaultAction, options?.steering?.defaultAction ?? 'steer');
        set(store.steerInterruptsByDefault, options?.interrupts ?? false);
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
      <PreferenceState />
      <QueueState />
    </RecoilRoot>,
  );
}

describe('PendingSteerChips — ambiguous delivery retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides same-id Retry for a legacy ambiguous delivery', () => {
    renderChips([], {
      steers: [
        {
          steerId: 'legacy-uncertain',
          text: 'may already be queued',
          status: 'failed',
          deliveryUncertain: true,
          generationProtocolVersion: 1,
          createdAt: 1,
        },
      ],
    });

    expect(screen.queryByText('com_ui_steer_retry')).toBeNull();
  });

  it('offers same-id Retry only after protocol v2 was negotiated', () => {
    renderChips([], {
      steers: [
        {
          steerId: 'v2-uncertain',
          text: 'dedupe this retry',
          status: 'failed',
          deliveryUncertain: true,
          generationProtocolVersion: 2,
          createdAt: 1,
        },
      ],
    });

    fireEvent.click(screen.getByText('com_ui_steer_retry'));
    expect(mockRetrySteer).toHaveBeenCalledWith(
      'v2-uncertain',
      'dedupe this retry',
      undefined,
      { quotes: undefined, manualSkills: undefined },
      { preempt: false, createdAt: 1, generationProtocolVersion: 2 },
    );
  });
});

describe('PendingSteerChips — queued primary availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not offer Send now while answer mode owns the submission slot', () => {
    renderChips([{ id: 'answer-queued', text: 'wait until the answer resumes', createdAt: 1 }], {
      steering: {
        duringRunActive: false,
        canSendQueuedNow: false,
        canSteer: false,
        pausedOnApproval: true,
      },
    });

    expect(screen.queryByText('com_ui_send_now')).toBeNull();
    expect(screen.getByTestId('queued-interrupt-now')).toBeDisabled();
    expect(mockSendQueuedNow).not.toHaveBeenCalled();
  });
});

describe('PendingSteerChips — queued trash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('returns the words to the composer when removing a queued message', async () => {
    // The trash is non-destructive: it hands the text (and its carried context)
    // to the gated restore once removal succeeds, so the words are not gone forever.
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

    await waitFor(() => {
      expect(mockRestoreToComposer).toHaveBeenCalledWith(
        'later thought',
        undefined,
        { quotes: ['a quote'], manualSkills: ['a-skill'] },
        CONVO_ID,
      );
      expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
    });
  });

  it('still removes the message even when the composer refuses the restore', async () => {
    // Occupied composer / other chat: the gated restore returns false, but the
    // trash must reliably remove either way.
    mockRestoreToComposer.mockReturnValueOnce(false);
    renderChips([{ id: 'q2', text: 'drop me', createdAt: 1 }]);
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    await waitFor(() => {
      expect(mockRestoreToComposer).toHaveBeenCalled();
      expect(mockRemoveQueued).toHaveBeenCalledWith('q2');
    });
  });

  it('discards a recovered source before restoring and removing its queued row', async () => {
    let confirmDiscard: ((discarded: boolean) => void) | undefined;
    mockDiscardQueued.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          confirmDiscard = resolve;
        }),
    );
    const recovered = {
      id: 'q-recovered',
      text: 'recovered words',
      createdAt: 1,
      recoverySteerId: 'server-source',
      recoveryClientSteerId: 'client-source',
    };
    renderChips([recovered]);

    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));
    expect(mockDiscardQueued).toHaveBeenCalledWith(recovered);
    expect(mockRestoreToComposer).not.toHaveBeenCalled();

    await act(async () => {
      confirmDiscard?.(true);
    });
    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'recovered words',
      undefined,
      { quotes: undefined, manualSkills: undefined },
      CONVO_ID,
    );
    expect(mockRemoveQueued).toHaveBeenCalledWith('q-recovered');
  });

  it('discards a dead server row before restoring and removing it', async () => {
    const dead = {
      id: 'q-dead',
      text: 'recover dead work',
      createdAt: 1,
      clientRequestId: 'client-dead',
      server: {
        id: 'server-dead',
        status: 'rejected' as const,
        errorCode: 'ADMISSION_FAILED',
      },
    };
    renderChips([dead]);

    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    await waitFor(() => expect(mockDiscardQueued).toHaveBeenCalledWith(dead));
    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'recover dead work',
      undefined,
      { quotes: undefined, manualSkills: undefined },
      CONVO_ID,
    );
    expect(mockRemoveQueued).toHaveBeenCalledWith('q-dead');
  });

  it('offers Edit for a recovered row and leaves it untouched when discard is refused', async () => {
    const user = userEvent.setup();
    mockDiscardQueued.mockResolvedValueOnce(false);
    const recovered = {
      id: 'q-recovered',
      text: 'safe to edit only after discard',
      createdAt: 1,
      recoverySteerId: 'server-source',
      recoveryClientSteerId: 'client-source',
    };
    renderChips([recovered]);

    await user.click(screen.getByLabelText('com_ui_more_options'));
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_edit_message' }));

    await waitFor(() => expect(mockDiscardQueued).toHaveBeenCalledWith(recovered));
    expect(mockRestoreToComposer).not.toHaveBeenCalled();
    expect(mockEditToComposer).not.toHaveBeenCalled();
    expect(mockRemoveQueued).not.toHaveBeenCalled();
    expect(screen.getByText('safe to edit only after discard')).toBeInTheDocument();
  });

  it('uses the guarded composer restore only after recovered Edit confirms discard', async () => {
    const user = userEvent.setup();
    let confirmDiscard: ((discarded: boolean) => void) | undefined;
    mockDiscardQueued.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          confirmDiscard = resolve;
        }),
    );
    const recovered = {
      id: 'q-recovered-edit',
      text: 'edit recovered words',
      createdAt: 1,
      recoverySteerId: 'server-source',
      recoveryClientSteerId: 'client-source',
      quotes: ['kept quote'],
      manualSkills: ['kept skill'],
    };
    renderChips([recovered]);

    await user.click(screen.getByLabelText('com_ui_more_options'));
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_edit_message' }));
    expect(mockEditToComposer).not.toHaveBeenCalled();

    await act(async () => {
      confirmDiscard?.(true);
    });
    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'edit recovered words',
      undefined,
      { quotes: ['kept quote'], manualSkills: ['kept skill'] },
      CONVO_ID,
    );
    expect(mockEditToComposer).not.toHaveBeenCalled();
    expect(mockRemoveQueued).toHaveBeenCalledWith('q-recovered-edit');
  });

  it('keeps a safely discarded Edit queued when live composer state changes during cancel', async () => {
    const user = userEvent.setup();
    let confirmDiscard: (() => void) | undefined;
    const recovered = {
      id: 'q-recovered-race',
      text: 'preserve after async race',
      createdAt: 1,
      clientRequestId: 'recovery-attempt',
      recoverySteerId: 'server-source',
      recoveryClientSteerId: 'client-source',
      quotes: ['kept quote'],
    };
    mockDiscardQueued.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          confirmDiscard = () => {
            updateQueueForTest?.((current) =>
              current.map((item) => {
                if (item.id !== recovered.id) {
                  return item;
                }
                const {
                  clientRequestId: _clientRequestId,
                  recoverySteerId: _recoverySteerId,
                  recoveryClientSteerId: _recoveryClientSteerId,
                  ...ordinary
                } = item;
                return ordinary;
              }),
            );
            resolve(true);
          };
        }),
    );
    renderChips([recovered]);

    await user.click(screen.getByLabelText('com_ui_more_options'));
    await user.click(await screen.findByRole('menuitem', { name: 'com_ui_edit_message' }));
    expect(mockDiscardQueued).toHaveBeenCalledWith(recovered);
    expect(mockRestoreToComposer).not.toHaveBeenCalled();

    // The live guard can change while the durable cancel request is pending.
    mockRestoreToComposer.mockReturnValueOnce(false);
    await act(async () => {
      confirmDiscard?.();
    });

    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'preserve after async race',
      undefined,
      { quotes: ['kept quote'], manualSkills: undefined },
      CONVO_ID,
    );
    expect(mockEditToComposer).not.toHaveBeenCalled();
    expect(mockRemoveQueued).not.toHaveBeenCalled();
    expect(screen.getByText('preserve after async race')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('queue-state').textContent ?? 'null')).toEqual([
      {
        id: 'q-recovered-race',
        text: 'preserve after async race',
        createdAt: 1,
        quotes: ['kept quote'],
      },
    ]);
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_steer_edit_queued',
      status: 'info',
    });
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
    window.localStorage.clear();
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

  it('stays visible but disabled while ask-user answer mode owns the composer', () => {
    renderChips([queuedMessage], {
      steering: { duringRunActive: false, canSteer: false, pausedOnApproval: true },
    });
    const button = screen.getByTestId('queued-interrupt-now');
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(mockSendQueuedNow).not.toHaveBeenCalled();
  });

  it('makes the hovered row the only advertised shortcut target', () => {
    renderChips([queuedMessage, { id: 'q2', text: 'urgent two', createdAt: 2 }], {
      steering: liveRun,
    });
    const [first, second] = screen.getAllByTestId('queued-interrupt-now');

    expect(first).not.toHaveAttribute('aria-keyshortcuts');
    expect(second).not.toHaveAttribute('aria-keyshortcuts');

    fireEvent.pointerEnter(first);
    expect(first).toHaveAttribute('data-escalate-steer-active', 'true');
    expect(first).toHaveAttribute('aria-keyshortcuts');
    expect(second).not.toHaveAttribute('data-escalate-steer-active');
    expect(second).not.toHaveAttribute('aria-keyshortcuts');

    fireEvent.pointerEnter(second);
    expect(first).not.toHaveAttribute('data-escalate-steer-active');
    expect(first).not.toHaveAttribute('aria-keyshortcuts');
    expect(second).toHaveAttribute('data-escalate-steer-active', 'true');
    expect(second).toHaveAttribute('aria-keyshortcuts');
  });

  it('names each queued escalation control with its target message', () => {
    renderChips([queuedMessage, { id: 'q2', text: 'urgent two', createdAt: 2 }], {
      steering: liveRun,
    });

    expect(
      screen.getByRole('button', { name: 'com_ui_interrupt_steer_now: urgent one' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'com_ui_interrupt_steer_now: urgent two' }),
    ).toBeInTheDocument();
  });

  it.each(['pointer', 'keyboard'] as const)(
    'keeps preference help visibly open after %s activation',
    async (activation) => {
      const user = userEvent.setup();
      renderChips([queuedMessage], { steering: liveRun });
      const menuButton = screen.getByLabelText('com_ui_more_options');
      await user.click(menuButton);

      const preference = await screen.findByRole('menuitem', {
        name: 'com_ui_turn_on_queueing',
      });
      expect(preference).toHaveAccessibleDescription('com_nav_info_during_run_action');
      const help = screen.getByRole('menuitem', {
        name: 'com_ui_more_info: com_ui_turn_on_queueing',
      });

      if (activation === 'pointer') {
        await user.click(help);
      } else {
        act(() => help.focus());
        expect(document.activeElement).toBe(help);
        await user.keyboard('{Enter}');
      }

      const menu = screen.getByRole('menu');
      const description = screen.getByText('com_nav_info_during_run_action');
      expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      expect(menu).toBeVisible();
      expect(help).toHaveAttribute('aria-expanded', 'true');
      expect(description).not.toHaveClass('sr-only');
      expect(description).toBeVisible();
    },
  );

  it.each([false, true])(
    'makes steering the default when enabling always-interrupt from queue mode (latent=%s)',
    async (interrupts) => {
      renderChips([queuedMessage], {
        steering: { ...liveRun, defaultAction: 'queue' },
        interrupts,
      });
      fireEvent.click(screen.getByLabelText('com_ui_more_options'));
      const preference = await screen.findByRole('menuitem', { name: 'com_ui_always_interrupt' });
      expect(preference).toHaveAccessibleDescription('com_ui_steer_interrupts_enable_info');
      fireEvent.click(preference);

      expect(screen.getByTestId('default-action-state')).toHaveTextContent('steer');
      expect(screen.getByTestId('interrupts-state')).toHaveTextContent('true');

      fireEvent.click(screen.getByLabelText('com_ui_more_options'));
      expect(await screen.findByText('com_ui_wait_for_tool_steps')).toBeInTheDocument();
    },
  );
});

describe('PendingSteerChips — queued caption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const queuedItem = { id: 'q1', text: 'follow up later', createdAt: 1 };

  it('explains when queued messages will send while a run is active', () => {
    renderChips([queuedItem], { steering: { duringRunActive: true } });
    expect(screen.getByTestId('queued-caption')).toHaveTextContent('com_ui_steer_queued_info');
  });

  it('renders one caption for the whole group, not one per row', () => {
    renderChips([queuedItem, { id: 'q2', text: 'and another', createdAt: 2 }], {
      steering: { duringRunActive: true },
    });
    expect(screen.getAllByTestId('queued-caption')).toHaveLength(1);
  });

  it('keeps the caption beside the ARIA list, never as a non-listitem child of it', () => {
    renderChips([queuedItem], { steering: { duringRunActive: true } });
    const list = screen.getByRole('list', { name: 'com_ui_queued_messages' });
    expect(list).not.toContainElement(screen.getByTestId('queued-caption'));
    expect(list).toContainElement(screen.getByTestId('queued-message-row'));
  });

  it('omits the caption once the run is over, when rows drain on their own terms', () => {
    renderChips([queuedItem], { steering: { duringRunActive: false } });
    expect(screen.queryByTestId('queued-caption')).toBeNull();
  });
});
