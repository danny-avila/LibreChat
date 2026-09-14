import { useCallback, useEffect, useState } from 'react';

interface OuterScrollWindow {
  /** Attach to the element the windowed content starts at. */
  ref: (node: HTMLElement | null) => void;
  /** Visible height of the scroll viewport. */
  height: number;
  /** Viewport scroll offset expressed in the attached element's own coordinates. */
  scrollTop: number;
}

/**
 * Translates an ancestor's scroll position into the coordinates of a descendant,
 * so a virtualized list can be windowed by a scroll container it does not own —
 * the list renders at its natural height and the outer container scrolls it.
 *
 * `content` is the wrapper holding everything inside the viewport: siblings above
 * the list (collapsible sections) change the list's offset without resizing either
 * the viewport or the list, and observing that wrapper is what catches those.
 */
export default function useOuterScrollWindow(
  viewport: HTMLElement | null,
  content: HTMLElement | null,
): OuterScrollWindow {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [metrics, setMetrics] = useState({ height: 0, scrollTop: 0 });

  const ref = useCallback((element: HTMLElement | null) => setNode(element), []);

  useEffect(() => {
    if (!viewport || !node) {
      return;
    }

    const measure = () => {
      /** Read against the viewport rather than `offsetTop`, whose origin is the
       *  nearest positioned ancestor and so moves with unrelated styling. */
      const offsetTop =
        node.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop;
      const next = {
        height: viewport.clientHeight,
        scrollTop: Math.max(0, viewport.scrollTop - offsetTop),
      };
      setMetrics((prev) =>
        prev.height === next.height && prev.scrollTop === next.scrollTop ? prev : next,
      );
    };

    let frame = 0;
    const schedule = () => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    viewport.addEventListener('scroll', schedule, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(viewport);
      if (content) {
        observer.observe(content);
      }
    } else {
      window.addEventListener('resize', schedule);
    }

    return () => {
      viewport.removeEventListener('scroll', schedule);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [viewport, content, node]);

  return { ref, height: metrics.height, scrollTop: metrics.scrollTop };
}
