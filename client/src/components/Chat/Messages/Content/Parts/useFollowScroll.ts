import { useRef, useCallback, useLayoutEffect } from 'react';
import type { RefObject, UIEventHandler } from 'react';

/** Bottom proximity (px) still treated as "following". Within it, new
 *  streamed content re-pins the pane; beyond it, the user has scrolled
 *  up to read and the stream must not snatch the viewport back. */
const FOLLOW_THRESHOLD_PX = 40;

/**
 * Keeps a capped tool-detail pane (`max-h-* overflow-auto`) pinned to the
 * tail of its content while that content is still streaming — the same
 * follow contract as the message tree, scoped to the pane's own scroller.
 *
 * Under the cap the pane grows in place and the outer message auto-scroll
 * already keeps the tail visible; this hook takes over at the moment the
 * cap is hit and the pane becomes an internal scroller, which would
 * otherwise freeze at the top while every subsequent delta lands below
 * the fold.
 *
 * `content` is the streamed string rendered inside the scroller — each
 * delta is a prop change, so a layout effect keyed on it re-pins before
 * paint with no observers or listeners beyond React's own `onScroll`.
 * The pin's own scroll event measures distance zero and keeps the
 * attached state, so programmatic scrolls need no special-casing.
 * Finished panes (`active === false`) are never scrolled: a completed
 * call opens reading from the top.
 */
export default function useFollowScroll<T extends HTMLElement>(
  content: string,
  active: boolean,
): { ref: RefObject<T>; onScroll: UIEventHandler<T> } {
  const ref = useRef<T>(null);
  const followRef = useRef(true);

  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    const el = event.currentTarget;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    if (!active || !followRef.current) {
      return;
    }
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, active]);

  return { ref, onScroll };
}
