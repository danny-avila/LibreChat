import { useRef, useCallback, useLayoutEffect } from 'react';
import type { ReactNode, RefObject, UIEventHandler } from 'react';

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
 * `content` is the node actually rendered inside the scroller — callers
 * pass the highlighted output falling back to the raw string, so the pin
 * re-fires on the async highlight commit, which is the render where the
 * DOM really changes. Keying on the source string alone would measure the
 * previous frame's DOM and leave the final chunk below the fold (or, for
 * a block that appears in one update, pin an empty pane and never
 * recover). Each such commit runs this layout effect before paint, so no
 * observers are needed beyond React's own `onScroll`.
 *
 * `expanded` gates the pin to visible panes: a collapsed pane is still
 * mounted (the disclosure is a CSS collapse) and would otherwise be
 * scrolled invisibly, so a call that finishes before its first expansion
 * would open at the tail. Gated, it opens reading from the top, while an
 * expand mid-stream pins immediately. The pin's own scroll event measures
 * distance zero and keeps the attached state, so programmatic scrolls
 * need no special-casing. Finished panes (`active === false`) are never
 * scrolled.
 */
export default function useFollowScroll<T extends HTMLElement>(
  content: string | readonly ReactNode[],
  active: boolean,
  expanded: boolean,
): { ref: RefObject<T>; onScroll: UIEventHandler<T> } {
  const ref = useRef<T>(null);
  const followRef = useRef(true);

  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    const el = event.currentTarget;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    if (!active || !expanded || !followRef.current) {
      return;
    }
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content, active, expanded]);

  return { ref, onScroll };
}
