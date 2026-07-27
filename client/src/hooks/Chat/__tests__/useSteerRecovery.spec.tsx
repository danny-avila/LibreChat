import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, type MutableSnapshot } from 'recoil';
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

function setup(initialize?: (snapshot: MutableSnapshot) => void) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
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

    /* The block this hook lives in unmounts the moment the run ends, which is
       exactly when a retry's ack tends to land. It has to survive that: the
       words go to the queue rather than leaving the chip saying `sending`. */
    /* The block this hook lives in unmounts the moment the run ends, which is
       exactly when a retry's ack tends to land. It has to survive that: the
       words go to the queue rather than leaving the chip saying `sending`. */
    it('queues a retry whose ack lands after the run ended', async () => {
      let settle: (value: unknown) => void = () => undefined;
      mockMutateAsync.mockReturnValue(new Promise((resolve) => (settle = resolve)));

      let recovery: ReturnType<typeof useSteerRecovery> | undefined;
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
        return null;
      };
      const Tree = ({ live }: { live: boolean }) => (
        <RecoilRoot
          initializeState={({ set }) => {
            set(store.pendingSteersByConvoId(CONVO_ID), [
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

      rerender(<Tree live={false} />);
      await act(async () => {
        settle({ steerId: 'srv-late', status: 'queued', position: 1, conversationId: CONVO_ID });
      });

      expect(chips).toEqual([]);
      expect(queue).toEqual([expect.objectContaining({ id: 'srv-late', text: 'landed too late' })]);
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
