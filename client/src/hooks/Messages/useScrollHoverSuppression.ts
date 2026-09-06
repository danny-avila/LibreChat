import { useEffect } from 'react';

export const SCROLLING_CLASS = 'is-scrolling';
/** Long enough to cover trackpad momentum between wheel bursts, short enough
 *  that a click landing just after a scroll still hits its target. */
export const SCROLL_QUIET_MS = 140;

/**
 * While the thread scrolls, content moves under a stationary cursor and every
 * row that passes beneath it fires the hover machinery: enter/leave on each
 * action button, its tooltip store, and the React work that follows. Profiling
 * a wheel scroll over a 400-message thread charged 1231 ms of CPU to a single
 * `onMouseLeave`, and suppressing pointer events for the duration took the
 * scroll from 35.6 to 50.1 FPS with p95 frame time halved.
 *
 * Pointer events are disabled on the container's descendants, never the
 * container itself, so the scroll keeps working and keyboard focus, selection
 * on release, and assistive technology are untouched.
 */
export default function useScrollHoverSuppression(
  scrollableRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const element = scrollableRef.current;
    if (!element) {
      return;
    }

    let timer = 0;
    const release = () => {
      timer = 0;
      element.classList.remove(SCROLLING_CLASS);
    };
    const onScroll = () => {
      if (timer === 0) {
        element.classList.add(SCROLLING_CLASS);
      } else {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(release, SCROLL_QUIET_MS);
    };

    element.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      element.classList.remove(SCROLLING_CLASS);
    };
  }, [scrollableRef]);
}
