/**
 * @jest-environment jsdom
 */
import { useAtom, useAtomValue } from 'jotai';
import { act, render, renderHook, screen } from '@testing-library/react';
import { anySubmittingAtom, isSubmittingFamily } from '../submission';

function Indicator({ index }: { index: number }) {
  const isSubmitting = useAtomValue(isSubmittingFamily(index));
  return <p>{isSubmitting ? 'streaming' : 'idle'}</p>;
}

describe('isSubmittingFamily', () => {
  it('shows a component and a hook in the same store the same value', () => {
    render(<Indicator index={10} />);
    const { result } = renderHook(() => useAtom(isSubmittingFamily(10)));
    expect(screen.getByText('idle')).toBeInTheDocument();

    act(() => result.current[1](true));

    expect(result.current[0]).toBe(true);
    expect(screen.getByText('streaming')).toBeInTheDocument();

    act(() => result.current[1](false));
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('accepts an updater function', () => {
    const { result } = renderHook(() => useAtom(isSubmittingFamily(11)));
    act(() => result.current[1]((previous) => !previous));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
  });

  it('keeps panes independent', () => {
    const { result } = renderHook(() => ({
      main: useAtom(isSubmittingFamily(12)),
      added: useAtom(isSubmittingFamily(13)),
    }));
    act(() => result.current.added[1](true));
    expect(result.current.added[0]).toBe(true);
    expect(result.current.main[0]).toBe(false);
    act(() => result.current.added[1](false));
  });
});

describe('anySubmittingAtom', () => {
  it('is true while any pane generates, including one first used after the first read', () => {
    const { result } = renderHook(() => ({
      any: useAtomValue(anySubmittingAtom),
      first: useAtom(isSubmittingFamily(20)),
      second: useAtom(isSubmittingFamily(21)),
    }));
    expect(result.current.any).toBe(false);

    act(() => result.current.second[1](true));
    expect(result.current.any).toBe(true);

    act(() => result.current.first[1](true));
    act(() => result.current.second[1](false));
    expect(result.current.any).toBe(true);

    act(() => result.current.first[1](false));
    expect(result.current.any).toBe(false);
  });
});
