import React from 'react';
import { Constants } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState, type MutableSnapshot } from 'recoil';
import type { RunEnd, QueuedMessage } from '~/store/families';
import useQueueDrain from '../useQueueDrain';
import store from '~/store';

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

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={initialize}>
      <Harness />
      {children}
    </RecoilRoot>
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

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <RecoilRoot initializeState={initialize}>
          <Harness />
          {children}
        </RecoilRoot>
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
