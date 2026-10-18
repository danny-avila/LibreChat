import { act, renderHook } from '@testing-library/react';
import { useDraftValue } from './draft';
import { reconcileKeys } from './keys';

afterEach(() => {
  jest.useRealTimers();
});

describe('reconcileKeys', () => {
  let n = 0;
  const createKey = () => `k${n++}`;
  const byName = (item: { name: string }) => item.name;

  it('keeps keys by position when the length is unchanged (edits, renames)', () => {
    const prev = [{ name: 'a' }, { name: 'b' }];
    expect(
      reconcileKeys(prev, ['x', 'y'], [{ name: 'a' }, { name: 'renamed' }], byName, createKey),
    ).toEqual(['x', 'y']);
  });

  it('keeps the remaining keys when an item is removed, and makes a new key for an append', () => {
    const a = { name: 'a' };
    const b = { name: 'b' };
    const c = { name: 'c' };
    expect(reconcileKeys([a, b, c], ['x', 'y', 'z'], [a, c], byName, createKey)).toEqual([
      'x',
      'z',
    ]);
    const appended = reconcileKeys([a, c], ['x', 'z'], [a, c, { name: 'd' }], byName, createKey);
    expect(appended.slice(0, 2)).toEqual(['x', 'z']);
    expect(appended[2]).not.toMatch(/^[xz]$/);
  });

  it('matches reloaded items by identity', () => {
    const next = [{ name: 'c' }, { name: 'a' }, { name: 'new' }];
    const keys = reconcileKeys([{ name: 'a' }, { name: 'c' }], ['x', 'z'], next, byName, createKey);
    expect(keys.slice(0, 2)).toEqual(['z', 'x']);
  });
});

describe('useDraftValue', () => {
  it('commits after the delay, on commit(), and replaces the draft on external changes', () => {
    jest.useFakeTimers();
    const onCommit = jest.fn();
    const { result, rerender } = renderHook(({ value }) => useDraftValue({ value, onCommit }), {
      initialProps: { value: 'a' },
    });
    act(() => result.current.setDraft('ab'));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onCommit).toHaveBeenCalledWith('ab');
    act(() => result.current.setDraft('abc'));
    act(() => result.current.commit());
    expect(onCommit).toHaveBeenLastCalledWith('abc');
    rerender({ value: 'server' });
    expect(result.current.draft).toBe('server');
  });

  it('keeps a rejected draft local and restores the value on reset', () => {
    const onCommit = jest.fn<boolean | 'reset' | void, [string]>(() => false);
    const { result } = renderHook(() => useDraftValue({ value: 'kept', onCommit, delay: 0 }));
    act(() => result.current.setDraft(''));
    act(() => result.current.commit());
    expect(result.current.draft).toBe('');
    onCommit.mockImplementation(() => 'reset');
    act(() => result.current.commit());
    expect(result.current.draft).toBe('kept');
  });

  it('flushes a pending commit on unmount', () => {
    jest.useFakeTimers();
    const onCommit = jest.fn();
    const { result, unmount } = renderHook(() => useDraftValue({ value: '', onCommit }));
    act(() => result.current.setDraft('typed'));
    unmount();
    expect(onCommit).toHaveBeenCalledWith('typed');
  });
});
