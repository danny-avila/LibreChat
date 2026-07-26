import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, type MutableSnapshot } from 'recoil';
import useSteerRecovery from '../useSteerRecovery';
import store from '~/store';

const mockMutate = jest.fn();
const mockFetchStreamStatus = jest.fn();

jest.mock('~/data-provider', () => ({
  useSteerMessageMutation: () => ({ mutate: mockMutate }),
  fetchStreamStatus: (...args: unknown[]) => mockFetchStreamStatus(...args),
}));

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
      mockMutate.mockImplementation(() => undefined);
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

    it('swaps the local id for the server id on success, keeping it pending', () => {
      mockMutate.mockImplementation((_params, { onSuccess }) => {
        onSuccess({ steerId: 'srv-9', status: 'queued', position: 1, conversationId: CONVO_ID });
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-1', text: 'redo this', status: 'failed', createdAt: 5 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-1');
      });
      // The old local id must be gone entirely — leaving it behind is what let
      // the applied SteerPart and a stale pending copy render together.
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'srv-9', text: 'redo this', status: 'pending' }),
      ]);
    });

    it('routes to the queue on NO_ACTIVE_RUN instead of marking it failed again', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError({ response: { data: { code: 'NO_ACTIVE_RUN' } } });
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-2', text: 'too late', status: 'failed', createdAt: 7 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-2');
      });
      expect(result.current.chips).toEqual([]);
      expect(result.current.queue).toEqual([
        expect.objectContaining({ id: 'local-2', text: 'too late' }),
      ]);
    });

    it('also routes to the queue on RUN_PAUSED / STEER_UNSUPPORTED / STEER_QUEUE_FULL', () => {
      for (const code of ['RUN_PAUSED', 'STEER_UNSUPPORTED', 'STEER_QUEUE_FULL']) {
        mockMutate.mockImplementation((_params, { onError }) => {
          onError({ response: { data: { code } } });
        });
        const { result } = setup(({ set }) => {
          set(store.pendingSteersByConvoId(CONVO_ID), [
            { steerId: `local-${code}`, text: code, status: 'failed', createdAt: 1 },
          ]);
        });
        act(() => {
          result.current.recovery.retry(`local-${code}`);
        });
        expect(result.current.queue).toEqual([expect.objectContaining({ id: `local-${code}` })]);
      }
    });

    it('marks it failed again on an unrecognized error', () => {
      mockMutate.mockImplementation((_params, { onError }) => {
        onError(new Error('network'));
      });
      const { result } = setup(({ set }) => {
        set(store.pendingSteersByConvoId(CONVO_ID), [
          { steerId: 'local-3', text: 'network flake', status: 'failed', createdAt: 1 },
        ]);
      });
      act(() => {
        result.current.recovery.retry('local-3');
      });
      expect(result.current.chips).toEqual([
        expect.objectContaining({ steerId: 'local-3', status: 'failed' }),
      ]);
      expect(result.current.queue).toEqual([]);
    });

    it('no-ops when the steer id is no longer pending', () => {
      const { result } = setup();
      act(() => {
        result.current.recovery.retry('missing');
      });
      expect(mockMutate).not.toHaveBeenCalled();
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
