import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState, type MutableSnapshot } from 'recoil';
import useSteerRecovery from '../useSteerRecovery';
import store from '~/store';

const mockMutateAsync = jest.fn();

jest.mock('~/data-provider', () => ({
  useSteerMessageMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

/** The POST settles through the returned promise, so every case has to let the
 *  microtask queue run before asserting. */
const flush = () => act(async () => undefined);

const CONVO_ID = 'convo-steer-recovery';

/** The hook resolves "is the run over" from the conversation's own submitting
 *  state, not from its own unmount, so every case has to place the
 *  conversation in the store the way `ChatView` does. */
const seedRun = (snapshot: MutableSnapshot, submitting: boolean) => {
  snapshot.set(store.conversationKeysAtom, [0]);
  snapshot.set(store.conversationByIndex(0), { conversationId: CONVO_ID } as never);
  snapshot.set(store.isSubmittingFamily(0), submitting);
};

function setup(initialize?: (snapshot: MutableSnapshot) => void) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={(snapshot) => {
        seedRun(snapshot, true);
        initialize?.(snapshot);
      }}
    >
      {children}
    </RecoilRoot>
  );
  return renderHook(
    () => ({
      recovery: useSteerRecovery(CONVO_ID),
      chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
      queue: useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID)),
      applied: useRecoilValue(store.appliedSteerIdsByConvoId(CONVO_ID)),
    }),
    { wrapper },
  );
}

describe('useSteerRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retry', () => {
    it('marks the chip sending immediately', () => {
      mockMutateAsync.mockReturnValue(new Promise(() => undefined));
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-1', text: 'redo this', status: 'failed', createdAt: 5 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-1');
      });
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'local-1', status: 'sending' }),
      ]);
    });

    it('swaps the local id for the server id on success, keeping it pending', async () => {
      mockMutateAsync.mockResolvedValue({
        steerId: 'srv-9',
        status: 'queued',
        position: 1,
        conversationId: CONVO_ID,
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-1', text: 'redo this', status: 'failed', createdAt: 5 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-1');
      });
      await flush();
      // The old local id must be gone entirely — leaving it behind is what let
      // the applied SteerPart and a stale pending copy render together.
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'srv-9', text: 'redo this', status: 'pending' }),
      ]);
    });

    it('routes to the queue on NO_ACTIVE_RUN instead of marking it failed again', async () => {
      mockMutateAsync.mockRejectedValue({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-2', text: 'too late', status: 'failed', createdAt: 7 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-2');
      });
      await flush();
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({ id: 'local-2', text: 'too late' }),
      ]);
    });

    it('also routes to the queue on RUN_PAUSED / STEER_UNSUPPORTED / STEER_QUEUE_FULL', async () => {
      for (const code of ['RUN_PAUSED', 'STEER_UNSUPPORTED', 'STEER_QUEUE_FULL']) {
        mockMutateAsync.mockRejectedValue({ response: { data: { code } } });
        const { result } = setup(({ set }) => {
          set(store.pendingSteersByConvoId(CONVO_ID), [
            { steerId: `local-${code}`, text: code, status: 'failed', createdAt: 1 },
          ]);
        });
        act(() => {
          result.current.recovery.retry(`local-${code}`);
        });
        await flush();
        expect(result.current.queue).toEqual([expect.objectContaining({ id: `local-${code}` })]);
      }
    });

    it('marks it failed again on an unrecognized error', async () => {
      mockMutateAsync.mockRejectedValue(new Error('network'));
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-3', text: 'network flake', status: 'failed', createdAt: 1 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-3');
      });
      await flush();
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'local-3', status: 'failed' }),
      ]);
      expect(result.current.queue).toEqual([]);
    });

    /* A retry's ack tends to land right as the run ends, which is also when
       the block this hook lives in unmounts. Whether the words go to the queue
       turns on the run, not on the unmount. */
    const lateAck = async (endRun: boolean) => {
      let settle: (value: unknown) => void = () => undefined;
      mockMutateAsync.mockReturnValue(new Promise((resolve) => (settle = resolve)));

      let recovery: ReturnType<typeof useSteerRecovery> | undefined;
      let setSubmitting: ((value: boolean) => void) | undefined;
      let chips: unknown[] = [];
      let queue: unknown[] = [];
      const Recovery = () => {
        recovery = useSteerRecovery(CONVO_ID);
        return null;
      };
      /* Outlives the run, the way the store does: the hook's own tree goes
         away while the conversation's state stays behind to be read. */
      const Observer = () => {
        chips = useRecoilValue(store.pendingSteersByConvoId(CONVO_ID));
        queue = useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID));
        setSubmitting = useSetRecoilState(store.isSubmittingFamily(0));
        return null;
      };
      const Tree = ({ live }: { live: boolean }) => (
        <RecoilRoot
          initializeState={(snapshot) => {
            seedRun(snapshot, true);
            snapshot.set(store.pendingSteersByConvoId(CONVO_ID), [
              { steerId: 'local-late', text: 'landed too late', status: 'failed', createdAt: 3 },
            ]);
          }}
        >
          <Observer />
          {live && <Recovery />}
        </RecoilRoot>
      );

      const { rerender } = render(<Tree live={true} />);
      act(() => {
        recovery?.retry('local-late');
      });
      expect(chips).toEqual([expect.objectContaining({ status: 'sending' })]);

      if (endRun) {
        act(() => setSubmitting?.(false));
      }
      rerender(<Tree live={false} />);
      await act(async () => {
        settle({ steerId: 'srv-late', status: 'queued', position: 1, conversationId: CONVO_ID });
      });

      return { chips, queue };
    };

    it('queues a retry whose ack lands after the run ended', async () => {
      const { chips, queue } = await lateAck(true);
      expect(chips).toEqual([]);
      expect(queue).toEqual([expect.objectContaining({ id: 'srv-late', text: 'landed too late' })]);
    });

    /* Navigating away unmounts the same block while the resumable run carries
       on, and the server will still inject the accepted steer. Queueing it as
       a follow-up here is what sent the same words twice. */
    it('leaves the ack pending when the block unmounts on a still-live run', async () => {
      const { chips, queue } = await lateAck(false);
      expect(chips).toEqual([expect.objectContaining({ steerId: 'srv-late', status: 'pending' })]);
      expect(queue).toEqual([]);
    });

    /* Navigating to another chat swaps the conversation held in the index slot,
       so the run this steer belongs to is in no slot at all. Absence is not an
       ending: the server is still injecting the accepted steer, and reading the
       empty scan as "run over" queued the same words a second time. */
    it('leaves the ack pending when the user has navigated to another chat', async () => {
      let settle: (value: unknown) => void = () => undefined;
      mockMutateAsync.mockReturnValue(new Promise((resolve) => (settle = resolve)));

      let recovery: ReturnType<typeof useSteerRecovery> | undefined;
      let navigateAway: (() => void) | undefined;
      let chips: unknown[] = [];
      let queue: unknown[] = [];
      const Tree = () => {
        recovery = useSteerRecovery(CONVO_ID);
        chips = useRecoilValue(store.pendingSteersByConvoId(CONVO_ID));
        queue = useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID));
        const setConvo = useSetRecoilState(store.conversationByIndex(0));
        navigateAway = () => setConvo({ conversationId: 'a-different-chat' } as never);
        return null;
      };

      render(
        <RecoilRoot
          initializeState={(snapshot) => {
            seedRun(snapshot, true);
            snapshot.set(store.pendingSteersByConvoId(CONVO_ID), [
              { steerId: 'local-nav', text: 'still running', status: 'failed', createdAt: 2 },
            ]);
          }}
        >
          <Tree />
        </RecoilRoot>,
      );

      act(() => {
        recovery?.retry('local-nav');
      });
      act(() => navigateAway?.());
      await act(async () => {
        settle({ steerId: 'srv-nav', status: 'queued', position: 1, conversationId: CONVO_ID });
      });

      expect(chips).toEqual([expect.objectContaining({ steerId: 'srv-nav', status: 'pending' })]);
      expect(queue).toEqual([]);
    });

    /* An interrupt-steer that failed has to retry AS an interrupt: resent as an
       ordinary steer it lands at the run's next tool step instead of sealing the
       stream, which is not the action the chip says it is. */
    it('resubmits a failed interrupt-steer as an interrupt', async () => {
      mockMutateAsync.mockResolvedValue({
        steerId: 'srv-preempt',
        status: 'queued',
        position: 1,
        conversationId: CONVO_ID,
        preempt: true,
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          {
            steerId: 'local-preempt',
            text: 'stop and read this',
            status: 'failed',
            createdAt: 6,
            preempt: true,
          },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-preempt');
      });
      await flush();
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'stop and read this', preempt: true }),
      );
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'srv-preempt', preempt: true }),
      ]);
    });

    it('leaves an ordinary steer non-preempting on retry', async () => {
      mockMutateAsync.mockResolvedValue({
        steerId: 'srv-plain',
        status: 'queued',
        position: 1,
        conversationId: CONVO_ID,
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-plain', text: 'just a steer', status: 'failed', createdAt: 6 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-plain');
      });
      await flush();
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.not.objectContaining({ preempt: true }));
    });

    /* Capability degradation is a relabel, never an error: a server without the
       seal still queues the steer and echoes `preempt: false`. */
    it('follows the server down to an ordinary steer when the seal was not armed', async () => {
      mockMutateAsync.mockResolvedValue({
        steerId: 'srv-degraded',
        status: 'queued',
        position: 1,
        conversationId: CONVO_ID,
        preempt: false,
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          {
            steerId: 'local-degraded',
            text: 'seal it',
            status: 'failed',
            createdAt: 6,
            preempt: true,
          },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-degraded');
      });
      await flush();
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'srv-degraded', status: 'pending', preempt: false }),
      ]);
    });

    /* The picks the message was written with have to survive the retry, or the
       words are re-sent without the quotes and skills they referred to. */
    it('carries the quotes and skills the steer was written with', async () => {
      mockMutateAsync.mockResolvedValue({
        steerId: 'srv-ctx',
        status: 'queued',
        position: 1,
        conversationId: CONVO_ID,
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          {
            steerId: 'local-ctx',
            text: 'about that quote',
            status: 'failed',
            createdAt: 4,
            quotes: ['carried quote'],
            manualSkills: ['carried-skill'],
          },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-ctx');
      });
      await flush();
      expect(result.current.chips).toEqual([
        expect.objectContaining({
          steerId: 'srv-ctx',
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        }),
      ]);
    });

    it('no-ops when the steer id is no longer pending', () => {
      const { result } = setup();
      act(() => {
        result.current.recovery.retry('missing');
      });
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('sendAsNew', () => {
    it('moves the chip to the queue, merged chronologically with existing items', () => {
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 's-old', text: 'older failed steer', status: 'failed', createdAt: 0 },
        ]);
        set(store.queuedMessagesByConvoId(CONVO_ID), [
          { id: 'existing', text: 'first', createdAt: 1 },
        ]);
      });
      act(() => {
        result.current.recovery.sendAsNew('s-old');
      });
      expect(result.current.chips).toEqual([]);
      // Chronological merge (not blind-append): the older steer sorts ahead
      // of the already-queued, later item.
      expect(result.current.queue.map((item) => item.id)).toEqual(['s-old', 'existing']);
    });

    it('records the id in appliedSteerIds so a late ACK cannot re-mint the chip', () => {
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 's-late', text: 'send me', status: 'failed', createdAt: 1 },
        ]);
      });
      act(() => {
        result.current.recovery.sendAsNew('s-late');
      });
      expect(result.current.applied).toEqual(['s-late']);
    });
  });
});
