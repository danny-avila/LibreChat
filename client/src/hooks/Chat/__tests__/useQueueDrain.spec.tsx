import React from 'react';
import { Constants } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot, useRecoilValue, useSetRecoilState, type MutableSnapshot } from 'recoil';
import type { RunEnd, QueuedMessage } from '~/store/families';
import useQueueDrain from '../useQueueDrain';
import store from '~/store';

const mockMarkFilesUsage = jest.fn();
jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useMarkFilesUsageMutation: () => ({ mutate: mockMarkFilesUsage }),
}));

const INDEX = 0;
const CONVO_ID = 'convo-drain';

function setup(
  initialize?: (snapshot: MutableSnapshot) => void,
  activeConversationId: string | undefined = CONVO_ID,
) {
  const ask = jest.fn();
  const setters: {
    setRunEnd?: (value: RunEnd | null) => void;
    setIsSubmitting?: (value: boolean) => void;
    setQueue?: (value: { id: string; text: string; createdAt: number }[]) => void;
    setNewConvoQueue?: (value: { id: string; text: string; createdAt: number }[]) => void;
    setInterruptFlag?: (value: boolean) => void;
    queueRef?: { current: { id: string; text: string; createdAt: number }[] };
  } = {};

  function Harness() {
    setters.setRunEnd = useSetRecoilState(store.runEndByIndex(INDEX));
    setters.setIsSubmitting = useSetRecoilState(store.isSubmittingFamily(INDEX));
    setters.setQueue = useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID));
    setters.setNewConvoQueue = useSetRecoilState(
      store.queuedMessagesByConvoId(Constants.NEW_CONVO),
    );
    setters.setInterruptFlag = useSetRecoilState(store.drainAfterAbortByIndex(INDEX));
    useQueueDrain(INDEX, activeConversationId, ask);
    return null;
  }

  /* The drain renews the TTL hold on what stays queued, which goes through
   * react-query, so the harness needs a client. */
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initialize}>
        <Harness />
        {children}
      </RecoilRoot>
    </QueryClientProvider>
  );
  renderHook(() => null, { wrapper });
  return { ask, setters };
}

const emptyOverrides = { overrideFiles: [], overrideQuotes: [], overrideManualSkills: [] };

const queuedMessage = (id: string, text: string) => ({ id, text, createdAt: Date.now() });

const runEnd = (overrides: Partial<RunEnd> = {}): RunEnd => ({
  conversationId: CONVO_ID,
  outcome: 'completed',
  endedAt: Date.now(),
  ...overrides,
});

describe('useQueueDrain', () => {
  beforeEach(() => {
    mockMarkFilesUsage.mockClear();
  });

  it('drains exactly one queued message on clean completion', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        queuedMessage('q1', 'first follow-up'),
        queuedMessage('q2', 'second follow-up'),
      ]);
    });

    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith({ text: 'first follow-up' }, emptyOverrides);
  });

  it('parks a mismatched signal instead of draining into the wrong conversation', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'stay put')]);
    }, 'some-other-convo');

    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    // Not sent through the mounted (wrong-conversation) sender; the signal is
    // parked under its own conversation, freeing the shared index slot.
    expect(ask).not.toHaveBeenCalled();
  });

  it('drains a parked signal when the user returns to that conversation', async () => {
    const { ask } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'welcome back')]);
      set(store.pendingRunEndByConvoId(CONVO_ID), runEnd());
    });

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith({ text: 'welcome back' }, emptyOverrides);
  });

  it('passes a queued message`s attachments through as overrideFiles', async () => {
    const files = [{ file_id: 'f1', filepath: '/uploads/f1.png', type: 'image/png' }];
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'with media'), files },
      ]);
    });

    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith(
      { text: 'with media' },
      { overrideFiles: files, overrideQuotes: [], overrideManualSkills: [] },
    );
  });

  /** Items behind the drained one wait another full run, which may itself
   *  pause for approval, so a hold taken once at enqueue would lapse before a
   *  deep queue finishes draining. */
  it('renews the TTL hold on attachments that stay queued', async () => {
    const { setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'first'), files: [{ file_id: 'sent', type: 'image/png' }] },
        {
          ...queuedMessage('q2', 'second'),
          files: [{ file_id: 'still-queued', type: 'image/png' }],
        },
        { ...queuedMessage('q3', 'third'), files: [{ file_id: 'also-queued', type: 'image/png' }] },
      ]);
    });

    mockMarkFilesUsage.mockClear();
    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(mockMarkFilesUsage).toHaveBeenCalledTimes(1));
    /* Only what remains: the drained item's file is released at send. */
    expect(mockMarkFilesUsage).toHaveBeenCalledWith({
      file_ids: ['still-queued', 'also-queued'],
    });
  });

  it('does not renew when nothing with attachments stays queued', async () => {
    const { setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'only one'), files: [{ file_id: 'sent', type: 'image/png' }] },
      ]);
    });

    mockMarkFilesUsage.mockClear();
    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(mockMarkFilesUsage).not.toHaveBeenCalled());
  });

  /** The server caps ids per request, so a queue holding more than one batch
   *  must renew in several; truncating would leave later messages on their
   *  enqueue-time hold. */
  it('renews every queued attachment across multiple capped batches', async () => {
    const manyFiles = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ file_id: `${prefix}-${i}`, type: 'image/png' }));
    const { setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'first'), files: manyFiles('sent', 2) },
        { ...queuedMessage('q2', 'second'), files: manyFiles('a', 10) },
        { ...queuedMessage('q3', 'third'), files: manyFiles('b', 4) },
      ]);
    });

    mockMarkFilesUsage.mockClear();
    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(mockMarkFilesUsage).toHaveBeenCalledTimes(2));
    const sent = mockMarkFilesUsage.mock.calls.flatMap((call) => call[0].file_ids);
    expect(sent).toHaveLength(14);
    expect(sent).toContain('b-3');
    expect(sent).not.toContain('sent-0');
    for (const call of mockMarkFilesUsage.mock.calls) {
      expect(call[0].file_ids.length).toBeLessThanOrEqual(10);
    }
  });

  /** A refused send puts the item back with its run-end signal already
   *  consumed, so nothing else would touch it before the next drain. */
  it('renews a restored item when the send is refused', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'refused'), files: [{ file_id: 'restored', type: 'image/png' }] },
      ]);
    });
    ask.mockReturnValue(false);

    mockMarkFilesUsage.mockClear();
    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(mockMarkFilesUsage).toHaveBeenCalledTimes(1));
    expect(mockMarkFilesUsage).toHaveBeenCalledWith({ file_ids: ['restored'] });
  });

  /** A single run can pause for approval more than once, so renewal cannot
   *  depend on catching drain transitions alone. */
  it('renews on a heartbeat while items stay queued', async () => {
    jest.useFakeTimers();
    try {
      setup(({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [
          { ...queuedMessage('q1', 'waiting'), files: [{ file_id: 'held', type: 'image/png' }] },
        ]);
      });

      /* Immediate, then on each interval. */
      expect(mockMarkFilesUsage).toHaveBeenCalledTimes(1);
      expect(mockMarkFilesUsage).toHaveBeenCalledWith({ file_ids: ['held'] });

      act(() => {
        jest.advanceTimersByTime(30 * 60 * 1000);
      });
      expect(mockMarkFilesUsage).toHaveBeenCalledTimes(2);

      act(() => {
        jest.advanceTimersByTime(30 * 60 * 1000);
      });
      expect(mockMarkFilesUsage).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('emits no heartbeat when the queue holds no attachments', async () => {
    jest.useFakeTimers();
    try {
      setup(({ set }) => {
        set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'no files')]);
      });

      act(() => {
        jest.advanceTimersByTime(2 * 60 * 60 * 1000);
      });
      expect(mockMarkFilesUsage).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  /** Items queued during the first turn stay keyed under NEW_CONVO until that
   *  run ends, so renewing only the active id would skip them for its whole
   *  duration. */
  it('renews the pre-migration NEW_CONVO queue alongside the active one', async () => {
    setup(({ set }) => {
      set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), [
        { ...queuedMessage('n1', 'queued pre-migration'), files: [{ file_id: 'pending-migrate' }] },
      ]);
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { ...queuedMessage('q1', 'queued after'), files: [{ file_id: 'already-migrated' }] },
      ]);
    });

    await waitFor(() => expect(mockMarkFilesUsage).toHaveBeenCalled());
    const sent = mockMarkFilesUsage.mock.calls.flatMap((call) => call[0].file_ids);
    expect(sent).toContain('pending-migrate');
    expect(sent).toContain('already-migrated');
  });

  it('does not double-count the queue before migration', async () => {
    setup(({ set }) => {
      set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), [
        { ...queuedMessage('n1', 'new convo'), files: [{ file_id: 'only-once' }] },
      ]);
    }, Constants.NEW_CONVO as string);

    await waitFor(() => expect(mockMarkFilesUsage).toHaveBeenCalled());
    const sent = mockMarkFilesUsage.mock.calls.flatMap((call) => call[0].file_ids);
    expect(sent).toEqual(['only-once']);
  });

  it('passes carried quotes + manual skills through as overrides', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        {
          ...queuedMessage('q1', 'with context'),
          quotes: ['quoted excerpt'],
          manualSkills: ['skill-1'],
        },
      ]);
    });

    act(() => {
      setters.setRunEnd!(runEnd());
    });

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith(
      { text: 'with context' },
      { overrideFiles: [], overrideQuotes: ['quoted excerpt'], overrideManualSkills: ['skill-1'] },
    );
  });

  it('does not drain on user abort or error outcomes', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'kept')]);
    });

    act(() => {
      setters.setRunEnd!(runEnd({ outcome: 'aborted' }));
    });
    act(() => {
      setters.setRunEnd!(runEnd({ outcome: 'error' }));
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(ask).not.toHaveBeenCalled();
  });

  it('drains on abort when the interrupt & send flag is armed, then disarms', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'interrupt text')]);
      set(store.drainAfterAbortByIndex(INDEX), true);
    });

    act(() => {
      setters.setRunEnd!(runEnd({ outcome: 'aborted' }));
    });
    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith({ text: 'interrupt text' }, emptyOverrides),
    );

    // Flag consumed: a second abort does NOT drain
    act(() => {
      setters.setQueue!([queuedMessage('q2', 'still queued')]);
      setters.setRunEnd!(runEnd({ outcome: 'aborted' }));
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('waits for isSubmitting to flip false before draining', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [queuedMessage('q1', 'deferred')]);
      set(store.isSubmittingFamily(INDEX), true);
    });

    act(() => {
      setters.setRunEnd!(runEnd());
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(ask).not.toHaveBeenCalled();

    act(() => {
      setters.setIsSubmitting!(false);
    });
    await waitFor(() => expect(ask).toHaveBeenCalledWith({ text: 'deferred' }, emptyOverrides));
  });

  it('migrates a NEW_CONVO-keyed queue when the run started as a new conversation', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), [
        queuedMessage('q1', 'queued before convo existed'),
        queuedMessage('q2', 'second'),
      ]);
    });

    act(() => {
      setters.setRunEnd!(runEnd({ startedAsNewConvo: true }));
    });

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith({ text: 'queued before convo existed' }, emptyOverrides),
    );
  });

  describe('early-aborted first turn (NEW_CONVO-keyed signal)', () => {
    const OPTIMISTIC_ID = 'optimistic-stream-id';

    function setupNewConvo(initialize?: (snapshot: MutableSnapshot) => void) {
      const ask = jest.fn();
      const setters: {
        setRunEnd?: (value: RunEnd | null) => void;
        setInterruptFlag?: (value: boolean) => void;
      } = {};
      const state: {
        newConvoQueue?: QueuedMessage[];
        parkedUnderOptimistic?: RunEnd | null;
      } = {};

      function Harness() {
        setters.setRunEnd = useSetRecoilState(store.runEndByIndex(INDEX));
        setters.setInterruptFlag = useSetRecoilState(store.drainAfterAbortByIndex(INDEX));
        state.newConvoQueue = useRecoilValue(store.queuedMessagesByConvoId(Constants.NEW_CONVO));
        state.parkedUnderOptimistic = useRecoilValue(store.pendingRunEndByConvoId(OPTIMISTIC_ID));
        useQueueDrain(INDEX, Constants.NEW_CONVO as string, ask);
        return null;
      }

      const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <RecoilRoot initializeState={initialize}>
            <Harness />
            {children}
          </RecoilRoot>
        </QueryClientProvider>
      );
      renderHook(() => null, { wrapper });
      return { ask, setters, state };
    }

    it('leaves the NEW_CONVO queue in place and parks nothing under the optimistic id', async () => {
      const { ask, setters, state } = setupNewConvo(({ set }) => {
        set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), [
          queuedMessage('q1', 'queued during first turn'),
        ]);
      });

      act(() => {
        setters.setRunEnd!(
          runEnd({
            conversationId: Constants.NEW_CONVO as string,
            outcome: 'aborted',
            startedAsNewConvo: false,
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(ask).not.toHaveBeenCalled();
      // The queue stays visible on the restored new-chat composer.
      expect(state.newConvoQueue).toEqual([
        expect.objectContaining({ id: 'q1', text: 'queued during first turn' }),
      ]);
      expect(state.parkedUnderOptimistic).toBeNull();
    });

    it('drains under NEW_CONVO when interrupt & send was armed', async () => {
      const { ask } = setupNewConvo(({ set }) => {
        set(store.queuedMessagesByConvoId(Constants.NEW_CONVO), [
          queuedMessage('q1', 'interrupted first turn'),
        ]);
        set(store.drainAfterAbortByIndex(INDEX), true);
        set(store.runEndByIndex(INDEX), {
          conversationId: Constants.NEW_CONVO as string,
          outcome: 'aborted',
          startedAsNewConvo: false,
          endedAt: Date.now(),
        });
      });

      await waitFor(() =>
        expect(ask).toHaveBeenCalledWith({ text: 'interrupted first turn' }, emptyOverrides),
      );
      expect(ask).toHaveBeenCalledTimes(1);
    });
  });

  it('consumes the run-end signal (no double fire on re-render)', async () => {
    const { ask, setters } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        queuedMessage('q1', 'one'),
        queuedMessage('q2', 'two'),
      ]);
    });

    act(() => {
      setters.setRunEnd!(runEnd());
    });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));

    // Toggling isSubmitting without a fresh runEnd must not drain again
    act(() => {
      setters.setIsSubmitting!(true);
    });
    act(() => {
      setters.setIsSubmitting!(false);
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
