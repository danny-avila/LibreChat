import React from 'react';
import { getDefaultStore } from 'jotai';
import userEvent from '@testing-library/user-event';
import { RecoilRoot, useRecoilValue, useSetRecoilState } from 'recoil';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { PendingSteer, QueuedMessage, QueueDrainHold } from '~/store/families';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import { escalatingSteerFamily, queueExpandedFamily } from '~/store/steer';
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

let setHoldForTest: ((value: QueueDrainHold | null) => void) | undefined;

function HoldState() {
  setHoldForTest = useSetRecoilState(store.queueDrainHoldByConvoId(CONVO_ID));
  return null;
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

/** The outbox disclosure is jotai state on the module-global default store, so
 *  it outlives a render and would otherwise leak between tests in this file. */
beforeEach(() => {
  act(() => {
    getDefaultStore().set(queueExpandedFamily(CONVO_ID), false);
  });
});

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
      <HoldState />
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
    /* Two or more queued messages collapse into the outbox group; the per-row
     * escalation controls live in the expansion. */
    fireEvent.click(screen.getByTestId('queue-group-toggle'));
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
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

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

const mockBumpQueued = jest.fn();
/** Mirrors the real writer: records what is typed, blank included, so the rows
 *  under test see the same queue the app would. */
const mockUpdateQueuedText = jest.fn((id: string, text: string) => {
  updateQueueForTest?.((current) =>
    current.map((item) => (item.id === id ? { ...item, text } : item)),
  );
  return true;
});
const mockMergeQueued = jest.fn(() => true);
const mockCancelQueueDrain = jest.fn();
const mockEnqueue = jest.fn();
const mockRequeueCleared = jest.fn();
let mockClearQueued = jest.fn(async (): Promise<QueuedMessage | null> => null);

const outboxSteering = (overrides: Partial<SteeringControls> = {}) => ({
  bumpQueued: mockBumpQueued,
  updateQueuedText: mockUpdateQueuedText,
  mergeQueued: mockMergeQueued,
  clearQueued: mockClearQueued,
  cancelQueueDrain: mockCancelQueueDrain,
  enqueue: mockEnqueue,
  requeueCleared: mockRequeueCleared,
  ...overrides,
});

const twoQueued: QueuedMessage[] = [
  { id: 'q1', text: 'first thought', createdAt: 1 },
  { id: 'q2', text: 'second thought', createdAt: 2 },
];

describe('PendingSteerChips — queued outbox group', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearQueued = jest.fn(async (): Promise<QueuedMessage | null> => null);
  });

  it('leaves a lone queued message as a plain chip', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    expect(screen.queryByTestId('queue-group')).toBeNull();
    expect(screen.getAllByTestId('queued-message-row')).toHaveLength(1);
  });

  it('collapses two or more into one row showing the count and what sends next', () => {
    renderChips(twoQueued, { steering: outboxSteering() });

    expect(screen.getByTestId('queue-group')).toBeInTheDocument();
    expect(screen.getByTestId('queue-group-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('com_ui_queue_count')).toBeInTheDocument();
    expect(screen.getByText('com_ui_queue_next_up')).toBeInTheDocument();
    // The footprint is constant: the rows themselves are not mounted.
    expect(screen.queryByTestId('queued-message-row')).toBeNull();
  });

  it('expands to the full managed list and back', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    const toggle = screen.getByTestId('queue-group-toggle');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('queued-message-row')).toHaveLength(2);

    fireEvent.click(toggle);
    expect(screen.queryByTestId('queued-message-row')).toBeNull();
  });

  /** The escalate shortcut clicks the LAST queued control in the document, and
   *  collapsing unmounts the rows — so the newest message keeps one here. */
  it('keeps the escalate shortcut pointed at the newest message while collapsed', () => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });

    const controls = document.querySelectorAll('[data-escalate-steer="queued"]');
    expect(controls).toHaveLength(1);
    expect(controls[0]).toHaveAttribute('data-testid', 'queued-escalate-newest');

    fireEvent.click(screen.getByTestId('queued-escalate-newest'));
    expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }), {
      preempt: true,
    });
  });

  /** Steering refuses a recovery-bound item mid-run, so a proxy pointed at one
   *  would make the shortcut silently do nothing. */
  it('points the collapsed escalate stand-in at the newest ELIGIBLE message', () => {
    renderChips([twoQueued[0], { ...twoQueued[1], recoverySteerId: 'server-source' }], {
      steering: outboxSteering({ duringRunActive: true, canSteer: true }),
    });

    fireEvent.click(screen.getByTestId('queued-escalate-newest'));
    expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), {
      preempt: true,
    });
  });

  it('offers no collapsed escalate stand-in when every row is recovery-bound', () => {
    renderChips(
      twoQueued.map((message, i) => ({ ...message, recoverySteerId: `server-source-${i}` })),
      { steering: outboxSteering({ duringRunActive: true, canSteer: true }) },
    );

    expect(screen.queryByTestId('queued-escalate-newest')).toBeNull();
    expect(document.querySelectorAll('[data-escalate-steer="queued"]')).toHaveLength(0);
  });

  /** The group stands in for its rows while collapsed, so the accessible list
   *  must still contain an item — the rows themselves are unmounted. */
  it('exposes the collapsed group as the list`s item, and the rows as a nested list', () => {
    renderChips(twoQueued, { steering: outboxSteering() });

    const list = screen.getByRole('list');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(list).toContainElement(screen.getByTestId('queue-group'));

    fireEvent.click(screen.getByTestId('queue-group-toggle'));
    // Outer item (the group) plus its two nested rows.
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  /** The shortcut promises the newest waiting message, and a promotion moves
   *  that row to the FRONT — so the target cannot be read off the array tail. */
  it('keeps the escalate stand-in on the newest message after a promotion', () => {
    const promoted = [
      { id: 'q2', text: 'newest, promoted', createdAt: 2, bumpedAt: 500 },
      { id: 'q1', text: 'older', createdAt: 1 },
    ];
    renderChips(promoted, {
      steering: outboxSteering({ duringRunActive: true, canSteer: true }),
    });

    fireEvent.click(screen.getByTestId('queued-escalate-newest'));
    expect(mockSendQueuedNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }), {
      preempt: true,
    });
  });

  it('keeps the hidden escalate stand-in out of the tab order', () => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });

    expect(screen.getByTestId('queued-escalate-newest')).toHaveAttribute('tabindex', '-1');
  });

  /** The shortcut's fallback takes the LAST matching control in the document,
   *  and the rows render in drain order — so the stand-in has to be last in
   *  BOTH states, or a promotion silently retargets the shortcut. */
  it.each([
    ['collapsed', false],
    ['expanded', true],
  ])('leaves the escalate stand-in last in the document while %s', (_label, expand) => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });
    if (expand) {
      fireEvent.click(screen.getByTestId('queue-group-toggle'));
    }

    const controls = document.querySelectorAll('[data-escalate-steer="queued"]');
    expect(controls).toHaveLength(expand ? 3 : 1);
    expect(controls[controls.length - 1]).toHaveAttribute('data-testid', 'queued-escalate-newest');
  });

  it('still offers every row its own escalation control when expanded', () => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    expect(screen.getAllByTestId('queued-interrupt-now')).toHaveLength(2);
  });

  it('offers Send next on every row except the one already next', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const bumps = screen.getAllByTestId('queued-send-next');
    expect(bumps).toHaveLength(1);

    fireEvent.click(bumps[0]);
    expect(mockBumpQueued).toHaveBeenCalledWith('q2');
  });

  /** A promotion lifts a row to the top of the promotions tier, which is still
   *  below every interrupt — so with only interrupts ahead the button would
   *  advertise a no-op. */
  it('offers no Send next when only an unmovable interrupt is ahead', () => {
    renderChips(
      [
        { id: 'armed', text: 'interrupt', createdAt: 2, priority: true },
        { id: 'plain', text: 'ordinary', createdAt: 1 },
      ],
      { steering: outboxSteering() },
    );
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    expect(screen.queryByTestId('queued-send-next')).toBeNull();
  });

  it('still offers Send next past a movable row that sits behind an interrupt', () => {
    renderChips(
      [
        { id: 'armed', text: 'interrupt', createdAt: 3, priority: true },
        { id: 'first', text: 'ordinary one', createdAt: 1 },
        { id: 'second', text: 'ordinary two', createdAt: 2 },
      ],
      { steering: outboxSteering() },
    );
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    // Only the last row: it can overtake `first`, while `first` can overtake
    // nothing but the interrupt.
    const bumps = screen.getAllByTestId('queued-send-next');
    expect(bumps).toHaveLength(1);
    fireEvent.click(bumps[0]);
    expect(mockBumpQueued).toHaveBeenCalledWith('second');
  });

  /** Promotion eligibility is computed in one pass, so verify the rule still
   *  holds for a queue deep enough that the old per-row prefix scan mattered. */
  it('offers Send next on every row past the first movable one, at depth', () => {
    const deep = [
      { id: 'armed', text: 'interrupt', createdAt: 9, priority: true },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `q${i}`,
        text: `ordinary ${i}`,
        createdAt: i,
      })),
    ];
    renderChips(deep, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    // The interrupt and the first ordinary row cannot overtake anything.
    expect(screen.getAllByTestId('queued-send-next')).toHaveLength(4);
  });

  it('merges the batch into one turn', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));
    fireEvent.click(screen.getByTestId('queue-merge'));

    expect(mockMergeQueued).toHaveBeenCalledTimes(1);
  });

  /** Folding reads the queue, so an emptied editor would carry the words the
   *  user just deleted into the merged message. */
  it('refuses to merge while an inline edit is empty', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const rows = screen.getAllByTestId('queued-message-row');
    fireEvent.click(rows[1].querySelector('span[title]') as HTMLElement);
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '  ' } });

    const merge = screen.getByTestId('queue-merge');
    expect(merge).toBeDisabled();
    fireEvent.click(merge);
    expect(mockMergeQueued).not.toHaveBeenCalled();

    // Resolving the edit releases it.
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: 'rewritten' } });
    expect(screen.getByTestId('queue-merge')).not.toBeDisabled();
  });

  /** The queue still holds the pre-edit words, so handing them back would
   *  resurrect text the user visibly deleted. Emptying a row and removing it
   *  reads as "delete this". */
  it('does not return stale words to the composer when removing an emptied row', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    expect(mockRestoreToComposer).not.toHaveBeenCalled();
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  it('still returns the words when removing a row that was not being emptied', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByLabelText('com_ui_remove_queued'));

    expect(mockRestoreToComposer).toHaveBeenCalledWith(
      'first thought',
      undefined,
      { quotes: undefined, manualSkills: undefined },
      CONVO_ID,
    );
    expect(mockRemoveQueued).toHaveBeenCalledWith('q1');
  });

  /** Clear all folds the queue exactly as Merge does, so it takes the same
   *  standdown rather than being a documented exception. */
  it('refuses to clear all while an inline edit is empty', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const rows = screen.getAllByTestId('queued-message-row');
    fireEvent.click(rows[1].querySelector('span[title]') as HTMLElement);
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '' } });

    const clear = screen.getByTestId('queue-clear-all');
    expect(clear).toBeDisabled();
    fireEvent.click(clear);
    expect(mockClearQueued).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: 'kept' } });
    expect(screen.getByTestId('queue-clear-all')).not.toBeDisabled();
  });

  /** The composer box clips, so a deep queue needs its own scroll — and the
   *  disclosure and the actions must stay outside it to remain reachable. */
  it('scrolls the expanded rows without clipping the header or the actions', () => {
    renderChips(
      Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, text: `queued ${i}`, createdAt: i })),
      { steering: outboxSteering() },
    );
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const list = screen.getByTestId('queue-rows');
    // Named by its own count, so it does not duplicate the outer stack's label.
    expect(list).toHaveAttribute('role', 'list');
    expect(list).toHaveAccessibleName('com_ui_queue_count');
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('max-h-[35vh]');
    // Outside the scroll container, so they cannot be clipped away.
    expect(list).not.toContainElement(screen.getByTestId('queue-group-toggle'));
    expect(list).not.toContainElement(screen.getByTestId('queue-merge'));
    expect(list).not.toContainElement(screen.getByTestId('queue-clear-all'));
  });

  /** Collapsing unmounts the rows, so the disclosure's own text is the queue's
   *  only description — an aria-label would overwrite it. */
  it('announces the count and next-up preview as the disclosure name', () => {
    renderChips(twoQueued, { steering: outboxSteering() });

    const toggle = screen.getByTestId('queue-group-toggle');
    expect(toggle).not.toHaveAttribute('aria-label');
    expect(toggle).toHaveAccessibleName(/com_ui_queue_count/);
    expect(toggle).toHaveAccessibleName(/com_ui_queue_next_up/);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('refuses to merge while a recovered row holds a parked server source', () => {
    renderChips([twoQueued[0], { ...twoQueued[1], recoverySteerId: 'server-source' }], {
      steering: outboxSteering(),
    });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    expect(screen.getByTestId('queue-merge')).toBeDisabled();
    fireEvent.click(screen.getByTestId('queue-merge'));
    expect(mockMergeQueued).not.toHaveBeenCalled();
  });

  it('clear all hands the folded words back to the composer', async () => {
    const folded: QueuedMessage = {
      id: 'q1',
      text: 'first thought\n\nsecond thought',
      createdAt: 1,
    };
    mockClearQueued = jest.fn(async () => folded);
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));
    fireEvent.click(screen.getByTestId('queue-clear-all'));

    await waitFor(() => {
      expect(mockRestoreToComposer).toHaveBeenCalledWith(
        'first thought\n\nsecond thought',
        undefined,
        { quotes: undefined, manualSkills: undefined },
        CONVO_ID,
      );
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('returns the words to the queue when the composer refuses them', async () => {
    const folded: QueuedMessage = {
      id: 'q1',
      text: 'not lost',
      createdAt: 1,
      expectedPredecessorCreatedAt: 4242,
      priority: true,
      bumpedAt: 99,
    };
    mockClearQueued = jest.fn(async () => folded);
    mockRestoreToComposer.mockReturnValueOnce(false);
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));
    fireEvent.click(screen.getByTestId('queue-clear-all'));

    await waitFor(() => {
      /** The ITEM goes back whole, so no field can be quietly dropped — the
       *  fence and the interrupt tier were each lost once when this path
       *  rebuilt a row from parts. */
      expect(mockRequeueCleared).toHaveBeenCalledWith([folded]);
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_steer_edit_queued' }),
    );
  });
});

describe('PendingSteerChips — queued row editing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rewrites a waiting message in place', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: 'sharper thought' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(mockUpdateQueuedText).toHaveBeenCalledWith('q1', 'sharper thought');
  });

  /** The front row draining drops the queue below the grouping threshold, which
   *  remounts the surviving row. Unmounting an input fires no `blur`, so the
   *  flush has to happen on the way out or the typing is silently lost. */
  it('flushes an in-progress edit when the group collapses under it', () => {
    renderChips(twoQueued, { steering: outboxSteering() });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const rows = screen.getAllByTestId('queued-message-row');
    fireEvent.click(rows[1].querySelector('span[title]') as HTMLElement);
    fireEvent.change(screen.getByTestId('queued-message-edit'), {
      target: { value: 'edited while the front row drained' },
    });

    // The front row drains, leaving a lone message: the group gives way to a
    // plain chip and the edited row is remounted elsewhere in the tree.
    act(() => {
      updateQueueForTest!(() => [twoQueued[1]]);
    });

    expect(screen.queryByTestId('queue-group')).toBeNull();
    expect(mockUpdateQueuedText).toHaveBeenCalledWith('q2', 'edited while the front row drained');
  });

  /** `steering` is rebuilt at every run boundary. Whatever the write model,
   *  the invariant is that a run ending under an open editor must not make the
   *  edit final — Escape still has to put the original words back. */
  it('keeps an edit abandonable when the run state changes under it', () => {
    const Harness = ({ live }: { live: boolean }) => (
      <PendingSteerChips
        conversationId={CONVO_ID}
        steering={steeringStub(outboxSteering({ duringRunActive: live, canSteer: live }))}
        onEditToComposer={mockEditToComposer}
        onRestoreToComposer={mockRestoreToComposer}
      />
    );
    const tree = (live: boolean) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.queuedMessagesByConvoId(CONVO_ID), [twoQueued[0]]);
        }}
      >
        <Harness live={live} />
      </RecoilRoot>
    );

    const { rerender } = render(tree(true));
    fireEvent.click(screen.getByText('first thought'));
    fireEvent.change(screen.getByTestId('queued-message-edit'), {
      target: { value: 'still typing' },
    });

    // The run ends: same row, a freshly built `steering`.
    rerender(tree(false));
    expect(screen.getByTestId('queued-message-edit')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('queued-message-edit'), { key: 'Escape' });
    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'first thought');
  });

  /** A merged row carries paragraph breaks, and a single-line input flattens
   *  them on the first keystroke. */
  it('keeps paragraph breaks while editing a merged row', () => {
    renderChips([{ id: 'merged', text: 'first part\n\nsecond part', createdAt: 1 }], {
      steering: outboxSteering(),
    });

    fireEvent.click(screen.getByTitle('com_ui_queue_edit_inline'));
    const editor = screen.getByTestId('queued-message-edit');
    expect(editor.tagName).toBe('TEXTAREA');
    expect(editor).toHaveValue('first part\n\nsecond part');

    fireEvent.change(editor, { target: { value: 'first part\n\nsecond part edited' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(mockUpdateQueuedText).toHaveBeenCalledWith('merged', 'first part\n\nsecond part edited');
  });

  /** The drain reads the atom, not the local draft, so an edit still only local
   *  when the row sends would go out as the old text. The window opening is the
   *  last safe moment to settle it. */
  it('closes an open editor the moment a send becomes pending', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    fireEvent.change(screen.getByTestId('queued-message-edit'), {
      target: { value: 'final wording' },
    });
    // Written through immediately, so whatever sends is what is displayed.
    expect(mockUpdateQueuedText).toHaveBeenCalledWith('q1', 'final wording');

    // The run ends and the grace window opens.
    act(() => {
      setHoldForTest!({
        runEnd: { conversationId: CONVO_ID, outcome: 'completed', endedAt: 1 },
        dueAt: 4_000_000_000_000,
      });
    });

    expect(mockUpdateQueuedText).toHaveBeenCalledWith('q1', 'final wording');
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });

  it('does not offer an edit while a send is already pending', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });
    act(() => {
      setHoldForTest!({
        runEnd: { conversationId: CONVO_ID, outcome: 'completed', endedAt: 1 },
        dueAt: 4_000_000_000_000,
      });
    });

    fireEvent.click(screen.getByText('first thought'));
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });

  /** An IME candidate confirmation arrives as an unshifted Enter while
   *  composition is still active; committing there saves half-typed text. */
  it.each([
    ['isComposing', { key: 'Enter', isComposing: true }],
    ['keyCode 229', { key: 'Enter', keyCode: 229 }],
  ])('ignores Enter reported as %s by an IME', (_label, init) => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: 'partial candidate' } });
    fireEvent.keyDown(editor, init);

    // Still editing: candidate confirmation stays inside the editor.
    expect(screen.getByTestId('queued-message-edit')).toBeInTheDocument();
    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'partial candidate');
  });

  it('adds a line with Shift+Enter instead of committing', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    fireEvent.keyDown(screen.getByTestId('queued-message-edit'), { key: 'Enter', shiftKey: true });

    expect(mockUpdateQueuedText).not.toHaveBeenCalled();
    expect(screen.getByTestId('queued-message-edit')).toBeInTheDocument();
  });

  /** The write-through refuses blank text, so an emptied editor is the one state
   *  where the row still holds words the user has visibly deleted. */
  it('stands the senders down while the editor is empty', () => {
    renderChips([twoQueued[0]], {
      steering: outboxSteering({ duringRunActive: true, canSteer: true }),
    });

    fireEvent.click(screen.getByText('first thought'));
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '   ' } });

    expect(screen.getByText('com_ui_steer').closest('button')).toBeDisabled();
    expect(screen.getByTestId('queued-interrupt-now')).toBeDisabled();

    // Resolving the edit brings them back.
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: 'rewritten' } });
    expect(screen.getByText('com_ui_steer').closest('button')).not.toBeDisabled();
  });

  /** The blank was never written, so closing the editor alone would leave the
   *  queue holding words the screen no longer shows — and the drain sends the
   *  queue. Resolve it the way Escape does. */
  it('restores the original when a send arrives on an emptied editor', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '' } });

    act(() => {
      setHoldForTest!({
        runEnd: { conversationId: CONVO_ID, outcome: 'completed', endedAt: 1 },
        dueAt: 4_000_000_000_000,
      });
    });

    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'first thought');
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });

  /** The shortcut proxy targets this row but lives in the group, and the
   *  shortcut fires even while a textarea has focus — so emptying the editor has
   *  to reach it too, or Ctrl/Cmd+Shift+. sends the deleted words. */
  it('stands the shortcut proxy down for an empty edit, and brings it back', () => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    // The newest row is the proxy's target.
    const rows = screen.getAllByTestId('queued-message-row');
    fireEvent.click(rows[1].querySelector('span[title]') as HTMLElement);
    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: '' } });

    expect(screen.getByTestId('queued-escalate-newest')).toBeDisabled();

    fireEvent.change(screen.getByTestId('queued-message-edit'), { target: { value: 'rewritten' } });
    expect(screen.getByTestId('queued-escalate-newest')).not.toBeDisabled();
  });

  it('releases the empty-edit claim when the editor closes', () => {
    renderChips(twoQueued, { steering: outboxSteering({ duringRunActive: true, canSteer: true }) });
    fireEvent.click(screen.getByTestId('queue-group-toggle'));

    const rows = screen.getAllByTestId('queued-message-row');
    fireEvent.click(rows[1].querySelector('span[title]') as HTMLElement);
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: '' } });
    expect(screen.getByTestId('queued-escalate-newest')).toBeDisabled();

    // Escape restores the original words, so nothing is held back any more.
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.getByTestId('queued-escalate-newest')).not.toBeDisabled();
  });

  /** The invariant that lets every reader trust the data: a blank row cannot
   *  outlive its editor, so a resting queue never holds one. */
  it('restores the original when an emptied editor is closed rather than abandoned', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: '' } });
    // Blank while the editor is open, which is what the senders read.
    expect(JSON.parse(screen.getByTestId('queue-state').textContent ?? '[]')[0].text).toBe('');

    fireEvent.blur(editor);
    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'first thought');
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });

  it('trims the words it settles', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: '  spaced out  ' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'spaced out');
  });

  it('puts the original words back on Escape', () => {
    renderChips([twoQueued[0]], { steering: outboxSteering() });

    fireEvent.click(screen.getByText('first thought'));
    const editor = screen.getByTestId('queued-message-edit');
    fireEvent.change(editor, { target: { value: 'discard me' } });
    expect(mockUpdateQueuedText).toHaveBeenCalledWith('q1', 'discard me');

    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(mockUpdateQueuedText).toHaveBeenLastCalledWith('q1', 'first thought');
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });

  /** Its parked source is matched by exact text server-side, so the words may
   *  only change after the discard ladder has downgraded the row. */
  it('never edits a recovered row in place', () => {
    renderChips([{ ...twoQueued[0], recoverySteerId: 'server-source' }], {
      steering: outboxSteering(),
    });

    fireEvent.click(screen.getByText('first thought'));
    expect(screen.queryByTestId('queued-message-edit')).toBeNull();
  });
});

describe('PendingSteerChips — withheld automatic send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const withHold = (queued: QueuedMessage[]) =>
    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.queuedMessagesByConvoId(CONVO_ID), queued);
          set(store.queueDrainHoldByConvoId(CONVO_ID), {
            runEnd: {
              conversationId: CONVO_ID,
              outcome: 'completed' as const,
              endedAt: 1,
            },
            dueAt: Date.now() + 3000,
          });
        }}
      >
        <PendingSteerChips
          conversationId={CONVO_ID}
          steering={steeringStub(outboxSteering())}
          onEditToComposer={mockEditToComposer}
          onRestoreToComposer={mockRestoreToComposer}
        />
      </RecoilRoot>,
    );

  it('announces the send and offers to take it back', () => {
    withHold(twoQueued);

    const banner = screen.getByTestId('queue-sending-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.querySelector('[aria-live="polite"]')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('queue-undo-send'));
    expect(mockCancelQueueDrain).toHaveBeenCalledTimes(1);
  });

  it('shows nothing to undo once the queue is empty', () => {
    withHold([]);
    expect(screen.queryByTestId('queue-sending-banner')).toBeNull();
  });
});
