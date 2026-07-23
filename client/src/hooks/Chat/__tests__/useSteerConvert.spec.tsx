import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, useSetRecoilState, type MutableSnapshot } from 'recoil';
import useSteerConvert from '../useSteerConvert';
import store from '~/store';

const mockFetchStreamStatus = jest.fn();
jest.mock('~/data-provider', () => ({
  fetchStreamStatus: (...args: unknown[]) => mockFetchStreamStatus(...args),
}));

const CONVO_ID = 'convo-steer-convert';

function setup(initialize?: (snapshot: MutableSnapshot) => void) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
  );
  return renderHook(
    () => {
      const setQueue = useSetRecoilState(store.queuedMessagesByConvoId(CONVO_ID));
      return {
        convert: useSteerConvert(),
        chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
        queue: useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID)),
        applied: useRecoilValue(store.appliedSteerIdsByConvoId(CONVO_ID)),
        // Mirrors `useQueueDrain` dequeuing the head item after auto-send.
        drainQueue: () => setQueue((prev) => prev.slice(1)),
      };
    },
    { wrapper },
  );
}

describe('useSteerConvert', () => {
  it('converts leftover steers to queued chips and drops their pending chips', () => {
    const { result } = setup(({ set }) => {
      set(store.pendingSteersByConvoId(CONVO_ID), [
        { steerId: 'srv-1', text: 'leftover', status: 'pending' as const, createdAt: 1 },
        { steerId: 'local-x', text: 'still sending', status: 'sending' as const, createdAt: 2 },
      ]);
    });
    act(() => {
      result.current.convert(CONVO_ID, [{ steerId: 'srv-1', text: 'leftover', createdAt: 1 }]);
    });
    expect(result.current.queue).toEqual([expect.objectContaining({ id: 'srv-1' })]);
    expect(result.current.chips).toEqual([expect.objectContaining({ steerId: 'local-x' })]);
  });

  it('restores quotes + manual skills from the local chip (server steers never carry them)', () => {
    const { result } = setup(({ set }) => {
      set(store.pendingSteersByConvoId(CONVO_ID), [
        {
          steerId: 'srv-ctx',
          text: 'carried',
          status: 'pending' as const,
          createdAt: 1,
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        },
      ]);
    });
    act(() => {
      result.current.convert(CONVO_ID, [{ steerId: 'srv-ctx', text: 'carried', createdAt: 1 }]);
    });
    expect(result.current.chips).toEqual([]);
    expect(result.current.queue).toEqual([
      expect.objectContaining({
        id: 'srv-ctx',
        quotes: ['carried quote'],
        manualSkills: ['carried-skill'],
      }),
    ]);
  });

  it('falls back to context carried on the steer when its chip is already gone', () => {
    // A reclaimed steer stays interactive during its cancel round-trip, so a
    // competing X can delete the chip before the conversion runs. The steer
    // carries its own picks so they survive that race.
    const { result } = setup();
    act(() => {
      result.current.convert(CONVO_ID, [
        {
          steerId: 'reclaimed',
          text: 'carried',
          createdAt: 1,
          quotes: ['carried quote'],
          manualSkills: ['carried-skill'],
        },
      ]);
    });
    expect(result.current.queue).toEqual([
      expect.objectContaining({
        id: 'reclaimed',
        quotes: ['carried quote'],
        manualSkills: ['carried-skill'],
      }),
    ]);
  });

  it('adds no context fields when no local chip matches (fresh reload)', () => {
    const { result } = setup();
    act(() => {
      result.current.convert(CONVO_ID, [{ steerId: 'srv-plain', text: 'plain', createdAt: 1 }]);
    });
    expect(result.current.queue[0].quotes).toBeUndefined();
    expect(result.current.queue[0].manualSkills).toBeUndefined();
  });

  it('retains previously applied ids so a late 202 ACK still drops its chip', () => {
    const { result } = setup(({ set }) => {
      set(store.appliedSteerIdsByConvoId(CONVO_ID), ['srv-applied']);
    });
    act(() => {
      result.current.convert(CONVO_ID, [{ steerId: 'srv-queued', text: 'to queue' }]);
    });
    // Both the applied and converted steers are settled — an ACK arriving
    // after run end must not re-mint a pending chip for either.
    expect(result.current.applied).toEqual(['srv-applied', 'srv-queued']);
  });

  it('keeps interrupt front-inserts ahead of chronologically older steers', () => {
    const { result } = setup(({ set }) => {
      set(store.queuedMessagesByConvoId(CONVO_ID), [
        { id: 'urgent', text: 'interrupt message', createdAt: 100, priority: true },
      ]);
    });
    act(() => {
      // Older steer (createdAt 50) converts after the interrupt was queued.
      result.current.convert(CONVO_ID, [{ steerId: 'old', text: 'older steer', createdAt: 50 }]);
    });
    expect(result.current.queue.map((item) => item.id)).toEqual(['urgent', 'old']);
  });

  it('is idempotent across double delivery (abort response + final SSE event)', () => {
    const { result } = setup();
    const steers = [{ steerId: 'srv-2', text: 'delivered twice', createdAt: 5 }];
    act(() => {
      result.current.convert(CONVO_ID, steers);
      result.current.convert(CONVO_ID, steers);
    });
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.applied).toEqual(['srv-2']);
  });

  it('does not re-queue a steer already drained after conversion', () => {
    const { result } = setup();
    const steers = [{ steerId: 'srv-drained', text: 'submitted once', createdAt: 5 }];
    // First delivery converts the leftover steer into a queued chip.
    act(() => {
      result.current.convert(CONVO_ID, steers);
    });
    expect(result.current.queue).toEqual([expect.objectContaining({ id: 'srv-drained' })]);
    // The run-end drain submits it and removes it from the queue.
    act(() => {
      result.current.drainQueue();
    });
    expect(result.current.queue).toEqual([]);
    // A late redelivery of the SAME steer (claimParked /chat/status, abort
    // response, or reconnect) must NOT resurrect a queued chip for a message
    // that was already sent — the applied-id set marks it settled.
    act(() => {
      result.current.convert(CONVO_ID, steers);
    });
    expect(result.current.queue).toEqual([]);
    expect(result.current.applied).toEqual(['srv-drained']);
  });

  describe('claimParked (clears the parked server copy of live-delivered steers)', () => {
    beforeEach(() => {
      mockFetchStreamStatus.mockReset();
    });

    it('fires exactly one status fetch per batch and dedupes the claimed steers', async () => {
      mockFetchStreamStatus.mockResolvedValue({
        active: false,
        unrecoveredSteers: [
          { steerId: 'live-1', text: 'delivered live', createdAt: 1 },
          { steerId: 'parked-1', text: 'parked only', createdAt: 2 },
        ],
      });
      const { result } = setup();
      await act(async () => {
        result.current.convert(
          CONVO_ID,
          [
            { steerId: 'live-1', text: 'delivered live', createdAt: 1 },
            { steerId: 'live-2', text: 'also live', createdAt: 3 },
          ],
          { claimParked: true },
        );
      });
      expect(mockFetchStreamStatus).toHaveBeenCalledTimes(1);
      expect(mockFetchStreamStatus).toHaveBeenCalledWith(CONVO_ID);
      // The claimed copy of live-1 re-ran the id-deduped conversion: no double-add.
      expect(result.current.queue.map((item) => item.id)).toEqual(['live-1', 'parked-1', 'live-2']);
    });

    it('tolerates a failed status fetch without breaking conversion', async () => {
      mockFetchStreamStatus.mockRejectedValue(new Error('offline'));
      const { result } = setup();
      await act(async () => {
        result.current.convert(CONVO_ID, [{ steerId: 'srv-3', text: 'kept', createdAt: 1 }], {
          claimParked: true,
        });
      });
      expect(mockFetchStreamStatus).toHaveBeenCalledTimes(1);
      expect(result.current.queue).toEqual([expect.objectContaining({ id: 'srv-3' })]);
    });

    it('claims under claimConversationId while chips land under the chip key', async () => {
      mockFetchStreamStatus.mockResolvedValue({
        active: false,
        unrecoveredSteers: [
          { steerId: 'parked-2', text: 'parked under resolved id', createdAt: 2 },
        ],
      });
      const { result } = setup();
      await act(async () => {
        result.current.convert(CONVO_ID, [{ steerId: 'live-3', text: 'live', createdAt: 1 }], {
          claimParked: true,
          claimConversationId: 'convo-resolved',
        });
      });
      expect(mockFetchStreamStatus).toHaveBeenCalledTimes(1);
      expect(mockFetchStreamStatus).toHaveBeenCalledWith('convo-resolved');
      // Claimed steers still convert under the conversation the chips live on.
      expect(result.current.queue.map((item) => item.id)).toEqual(['live-3', 'parked-2']);
    });

    it('skips the claim without the option or with an empty batch', async () => {
      const { result } = setup();
      await act(async () => {
        result.current.convert(CONVO_ID, [{ steerId: 'srv-4', text: 'plain', createdAt: 1 }]);
        result.current.convert(CONVO_ID, [], { claimParked: true });
      });
      expect(mockFetchStreamStatus).not.toHaveBeenCalled();
      expect(result.current.queue).toEqual([expect.objectContaining({ id: 'srv-4' })]);
    });
  });
});
