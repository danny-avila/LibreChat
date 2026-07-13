import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { RecoilRoot, useRecoilValue, type MutableSnapshot } from 'recoil';
import useSteerConvert from '../useSteerConvert';
import store from '~/store';

const CONVO_ID = 'convo-steer-convert';

function setup(initialize?: (snapshot: MutableSnapshot) => void) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot initializeState={initialize}>{children}</RecoilRoot>
  );
  return renderHook(
    () => ({
      convert: useSteerConvert(),
      chips: useRecoilValue(store.pendingSteersByConvoId(CONVO_ID)),
      queue: useRecoilValue(store.queuedMessagesByConvoId(CONVO_ID)),
      applied: useRecoilValue(store.appliedSteerIdsByConvoId(CONVO_ID)),
    }),
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
});
