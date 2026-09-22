import React from 'react';
import { act, renderHook } from '@testing-library/react';
import useThrottledValue from '../useThrottledValue';

describe('useThrottledValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });
  afterEach(() => jest.useRealTimers());

  it('keeps trailing updates alive after Strict Mode effect cleanup', () => {
    const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 500), {
      initialProps: { value: 'first' },
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ value: 'latest' });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current).toBe('latest');
  });

  it('paints the leading change and the latest trailing value, then releases its timer', () => {
    jest.setSystemTime(1000);
    const { result, rerender, unmount } = renderHook(({ value }) => useThrottledValue(value, 500), {
      initialProps: { value: 'first' },
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    rerender({ value: 'leading' });
    expect(result.current).toBe('leading');
    rerender({ value: 'middle' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ value: 'trailing' });
    expect(result.current).toBe('leading');
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current).toBe('trailing');
    rerender({ value: 'pending' });
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
