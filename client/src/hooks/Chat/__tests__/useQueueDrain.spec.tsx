import React from 'react';
import { Constants } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState, type MutableSnapshot } from 'recoil';
import type { RunEnd } from '~/store/families';
import useQueueDrain from '../useQueueDrain';
import store from '~/store';

const INDEX = 0;
const CONVO_ID = 'convo-drain';

function setup(initialize?: (snapshot: MutableSnapshot) => void) {
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
    useQueueDrain(INDEX, ask);
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
    expect(ask).toHaveBeenCalledWith({ text: 'first follow-up' });
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
    expect(ask).toHaveBeenCalledWith({ text: 'with media' }, { overrideFiles: files });
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
    await waitFor(() => expect(ask).toHaveBeenCalledWith({ text: 'interrupt text' }));

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
    await waitFor(() => expect(ask).toHaveBeenCalledWith({ text: 'deferred' }));
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

    await waitFor(() => expect(ask).toHaveBeenCalledWith({ text: 'queued before convo existed' }));
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
