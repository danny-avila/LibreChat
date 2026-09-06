import { renderHook } from '@testing-library/react';
import useScrollHoverSuppression, {
  SCROLLING_CLASS,
  SCROLL_QUIET_MS,
} from '../useScrollHoverSuppression';

const scroller = () => {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return { current: element };
};

describe('useScrollHoverSuppression', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('marks the container only while it is scrolling', () => {
    const ref = scroller();
    renderHook(() => useScrollHoverSuppression(ref));

    expect(ref.current.classList.contains(SCROLLING_CLASS)).toBe(false);

    ref.current.dispatchEvent(new Event('scroll'));
    expect(ref.current.classList.contains(SCROLLING_CLASS)).toBe(true);

    jest.advanceTimersByTime(SCROLL_QUIET_MS + 1);
    expect(ref.current.classList.contains(SCROLLING_CLASS)).toBe(false);
  });

  /* A continuous scroll must not let the quiet timer fire mid-gesture, or the
     hover machinery comes back for every frame of a long fling. */
  it('holds the mark across a continuous gesture', () => {
    const ref = scroller();
    renderHook(() => useScrollHoverSuppression(ref));

    for (let i = 0; i < 10; i++) {
      ref.current.dispatchEvent(new Event('scroll'));
      jest.advanceTimersByTime(SCROLL_QUIET_MS - 20);
      expect(ref.current.classList.contains(SCROLLING_CLASS)).toBe(true);
    }

    jest.advanceTimersByTime(SCROLL_QUIET_MS + 1);
    expect(ref.current.classList.contains(SCROLLING_CLASS)).toBe(false);
  });

  /* The worst failure this could cause is a thread that never takes clicks
     again, so unmounting mid-scroll must always release it. */
  it('releases the mark when unmounted mid-scroll', () => {
    const ref = scroller();
    const element = ref.current;
    const { unmount } = renderHook(() => useScrollHoverSuppression(ref));

    element.dispatchEvent(new Event('scroll'));
    expect(element.classList.contains(SCROLLING_CLASS)).toBe(true);

    unmount();
    expect(element.classList.contains(SCROLLING_CLASS)).toBe(false);

    element.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(SCROLL_QUIET_MS + 1);
    expect(element.classList.contains(SCROLLING_CLASS)).toBe(false);
  });
});
