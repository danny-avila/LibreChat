import { act, renderHook } from '@testing-library/react';
import type { TranslationKeys } from '../useLocalize';
import useGreeting from '../useGreeting';

jest.mock('../useLocalize', () => {
  const mockTranslations: Record<string, string> = jest.requireActual(
    '~/locales/en/translation.json',
  );
  return {
    __esModule: true,
    default: () => (key: TranslationKeys, options?: { name?: string }) =>
      mockTranslations[key].replace(/{{name}}/g, options?.name ?? ''),
  };
});

/** 2024-01-09 is a Tuesday, which uses the default schedule. */
const tuesdayAt = (hours: number, minutes = 0) => new Date(2024, 0, 9, hours, minutes, 0, 0);

describe('useGreeting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves the localized greeting for the local time after mount', () => {
    jest.setSystemTime(tuesdayAt(9));
    const { result } = renderHook(() => useGreeting('Test User'));
    expect(result.current).toBe('Welcome, Test User');
  });

  it('omits the name when the user has none', () => {
    jest.setSystemTime(tuesdayAt(9));
    const { result } = renderHook(() => useGreeting());
    expect(result.current).toBe('Welcome');
  });

  it('updates automatically at the next boundary', () => {
    jest.setSystemTime(tuesdayAt(11, 59));
    const { result } = renderHook(() => useGreeting('Test User'));
    expect(result.current).toBe('Welcome, Test User');

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });
    expect(result.current).toBe("How's the day going, Test User?");

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 60 * 1000);
    });
    expect(result.current).toBe('Winding down, Test User?');

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 60 * 1000);
    });
    expect(result.current).toBe('Up late, Test User?');
  });

  it('recalculates when the tab becomes visible again after a clock jump', () => {
    jest.setSystemTime(tuesdayAt(11, 0));
    const { result } = renderHook(() => useGreeting('Test User'));
    expect(result.current).toBe('Welcome, Test User');

    /** Simulates a sleep/timezone shift: wall clock moved without the timer firing. */
    jest.setSystemTime(tuesdayAt(18, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('Winding down, Test User?');
    expect(jest.getTimerCount()).toBe(1);
  });

  it('ignores visibility changes while the tab is hidden', () => {
    jest.setSystemTime(tuesdayAt(11, 0));
    const { result } = renderHook(() => useGreeting('Test User'));

    const visibilityState = jest
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    jest.setSystemTime(tuesdayAt(18, 0));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe('Welcome, Test User');
    visibilityState.mockRestore();
  });

  it('clears its timer and listeners on unmount', () => {
    jest.setSystemTime(tuesdayAt(11, 59));
    const removeDocumentListener = jest.spyOn(document, 'removeEventListener');
    const removeWindowListener = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useGreeting('Test User'));
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith('focus', expect.any(Function));

    removeDocumentListener.mockRestore();
    removeWindowListener.mockRestore();
  });
});
