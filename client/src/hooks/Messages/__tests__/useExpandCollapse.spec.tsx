import { renderHook } from '@testing-library/react';
import useExpandCollapse, { EXPAND_TRANSITION } from '../useExpandCollapse';

function stubReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('useExpandCollapse', () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  test('animates the disclosure by default', () => {
    stubReducedMotion(false);

    const { result } = renderHook(() => useExpandCollapse(true));

    expect(result.current.style.transition).toBe(EXPAND_TRANSITION);
    expect(result.current.style.gridTemplateRows).toBe('1fr');
    expect(result.current.style.opacity).toBe(1);
  });

  /** The transition is an inline style, so it cannot carry a media query.
   *  Without this the panel still folds over 300ms for a reader who asked
   *  the platform for no motion. */
  test('drops the transition under prefers-reduced-motion', () => {
    stubReducedMotion(true);

    const { result } = renderHook(() => useExpandCollapse(true));

    expect(result.current.style.transition).toBe('none');
  });

  test('still collapses to a zero row under reduced motion', () => {
    stubReducedMotion(true);

    const { result } = renderHook(() => useExpandCollapse(false));

    expect(result.current.style.transition).toBe('none');
    expect(result.current.style.gridTemplateRows).toBe('0fr');
    expect(result.current.style.opacity).toBe(0);
  });
});
