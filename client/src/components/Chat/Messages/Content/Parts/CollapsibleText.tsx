import { memo, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Collapsed preview height (px) for a long message before "Show more". The
 *  tolerance below only decides whether the toggle appears: it absorbs the
 *  trailing markdown margin so content that fits but for its own bottom margin
 *  does not trip a pointless toggle. The clamp itself is applied only once the
 *  content actually overflows, so nothing is ever hidden without a toggle. */
const COLLAPSED_MAX_HEIGHT = 256;
const OVERFLOW_TOLERANCE = 8;

/**
 * Clamps a long user message to a preview height with a fade and a
 * "Show more" toggle, so a pasted wall of text or code cannot dominate the
 * thread. The clamp is visual only: `overflow-hidden` keeps the full text in
 * the DOM, so it stays readable by assistive tech, copyable, and findable by
 * in-page search. Renders children untouched while `enabled` is false, keeping
 * the DOM identical when the preference is off.
 */
const CollapsibleText = memo(function CollapsibleText({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const localize = useLocalize();
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);

  // Turning the preference off resets the reveal, so re-enabling always
  // starts from the collapsed preview instead of a stale expanded state.
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) {
      setExpanded(false);
    }
  }

  /** Measures the inner wrapper, which is never clamped: `scrollHeight` there
   *  is the natural content height, and its ResizeObserver fires when content
   *  grows or shrinks (font size change, a late image or diagram finishing
   *  layout) even while the outer region is clipped. */
  useEffect(() => {
    const el = contentRef.current;
    if (el == null) {
      return;
    }
    const measure = () =>
      setOverflowing(el.scrollHeight - COLLAPSED_MAX_HEIGHT > OVERFLOW_TOLERANCE);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  const clamped = !expanded && overflowing;

  return (
    <div className="w-full min-w-0">
      <div
        id={contentId}
        className={cn('relative w-full', clamped && 'overflow-hidden')}
        style={clamped ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
        onFocus={() => {
          if (clamped) {
            setExpanded(true);
          }
        }}
      >
        <div ref={contentRef} className="w-full">
          {children}
        </div>
        {clamped && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface-tertiary to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {localize(expanded ? 'com_ui_show_less' : 'com_ui_show_more')}
        </button>
      )}
    </div>
  );
});

export default CollapsibleText;
