import { useContext, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type * as t from '~/admin/types';
import { ExpandContext, ExpandRequestContext } from '~/admin/contexts/ExpandContext';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { holdsFilterMatch } from '~/admin/utils';

/**
 * Calls `apply(expanded)` for every Expand all / Collapse all issued after
 * mount (WS5: SH-2). `apply` must be stable (a state setter or memoized).
 */
export function useExpandSignal(apply: (expanded: boolean) => void): void {
  const signal = useContext(ExpandContext);
  const seenSeq = useRef(signal.seq);

  useEffect(() => {
    if (signal.seq === seenSeq.current) return;
    seenSeq.current = signal.seq;
    if (signal.mode) apply(signal.mode === 'expand');
  }, [signal, apply]);
}

/**
 * Expanded state of a collapsible that follows the page's Expand all and
 * Collapse all (WS5: SH-2). A collapsible mounted after an Expand all starts
 * open, so nested groups that render lazily open as their parent does.
 */
export function useExpandableState(
  defaultExpanded: boolean,
  revealPaths?: readonly string[],
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const startOpen = useContext(ExpandContext).mode === 'expand';
  const filter = useRevealingFilter(revealPaths);
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded || startOpen || !!filter);
  /** Whether it was open before the filter opened it: clearing the filter puts that back. */
  const beforeFilter = useRef<boolean | null>(filter ? defaultExpanded || startOpen : null);
  const latest = useRef(isExpanded);
  latest.current = isExpanded;
  useExpandSignal(setIsExpanded);
  useEffect(() => {
    if (filter) {
      if (beforeFilter.current === null) beforeFilter.current = latest.current;
      setIsExpanded(true);
      return;
    }
    if (beforeFilter.current === null) return;
    setIsExpanded(beforeFilter.current);
    beforeFilter.current = null;
  }, [filter]);
  return [isExpanded, setIsExpanded];
}

/**
 * The tab filter while it matched one of `revealPaths` or something inside
 * them (a collapsible holding a match opens, WS5), else null.
 */
export function useRevealingFilter(revealPaths?: readonly string[]): t.PathIndex | null {
  const filter = useContext(RowFilterContext);
  if (!filter || !revealPaths) return null;
  return revealPaths.some((path) => holdsFilterMatch(filter, path)) ? filter : null;
}

/** Expand all / Collapse all for the collapsibles under the nearest `ExpandProvider` (WS5). */
export function useExpandRequest(): (mode: 'expand' | 'collapse') => void {
  return useContext(ExpandRequestContext);
}
