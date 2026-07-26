import { useRef, useMemo, useState, useLayoutEffect } from 'react';

interface Keyed {
  key: string;
}

/**
 * Reorders wrapping chips so they fill each row instead of leaving ragged gaps.
 *
 * Chips arrive in catalog order, which for skills and MCP servers is close to
 * alphabetical: a very long name landing mid-row pushes everything after it down
 * and strands the remainder of that row. Ordering widest-first is the
 * first-fit-decreasing heuristic, so the wide chips claim their rows early and
 * the narrow ones backfill whatever is left.
 *
 * Widths are measured rather than estimated from label length, which is a poor
 * proxy in a proportional font and worse across languages. They are keyed by
 * chip id so a reorder reuses the previous measurements instead of triggering
 * another pass, which is what keeps this from oscillating.
 */
export default function useChipPacking<T extends Keyed>(
  items: T[],
): {
  ordered: T[];
  /** Put this on whatever encloses the chips; they are found by role, so they
   *  may be split across several containers. */
  rootRef: React.RefObject<HTMLDivElement>;
  /** Measured chip widths by key, empty until every chip has been seen. */
  widths: Record<string, number>;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  const widthsRef = useRef<Record<string, number>>({});
  const [version, setVersion] = useState(0);

  const ordered = useMemo(() => {
    const widths = widthsRef.current;
    /* Until every chip has been measured, leave the order alone: a partial sort
       would shuffle on each pass and never settle. `version` is the dependency
       that re-runs this once measuring completes. */
    if (items.some((item) => widths[item.key] == null)) {
      return items;
    }
    return [...items].sort((a, b) => widths[b.key] - widths[a.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, version]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const widths = widthsRef.current;
    let changed = false;
    /* Queried by role rather than walked as children: the caller may split the
       chips across rows. Document order still matches `ordered`. */
    root.querySelectorAll<HTMLElement>('[role="listitem"]').forEach((node, index) => {
      const key = ordered[index]?.key;
      const width = node.offsetWidth;
      if (key != null && width > 0 && widths[key] !== width) {
        widths[key] = width;
        changed = true;
      }
    });
    /* Drop stale entries so a chip that comes back later is re-measured. */
    const live = new Set(items.map((item) => item.key));
    for (const key of Object.keys(widths)) {
      if (!live.has(key)) {
        delete widths[key];
        changed = true;
      }
    }
    if (changed) {
      setVersion((value) => value + 1);
    }
  }, [items, ordered]);

  /* Snapshotted so a new measurement is a new identity, which is what lets the
     caller memoize on it. */
  const widths = useMemo(
    () => ({ ...widthsRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return { ordered, rootRef, widths };
}
