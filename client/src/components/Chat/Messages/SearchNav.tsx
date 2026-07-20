import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface SearchNavEntry {
  id: string;
  index: number;
  isUser: boolean;
  isEnd: boolean;
  preview: string;
}

interface SearchNavProps {
  entries: SearchNavEntry[];
  currentIndex: number | null;
  visibleIndices: Set<number>;
  onJump: (index: number, smooth: boolean) => void;
}

const DRAG_THRESHOLD = 4;

type RibDims = { baseW: number; baseH: number; peakW: number; peakH: number };

const RIB_END: RibDims = { baseW: 3, baseH: 3, peakW: 4.5, peakH: 4.5 };
const RIB_MESSAGE: RibDims = { baseW: 12, baseH: 3, peakW: 39, peakH: 6 };

/** Vertical falloff radius (content-space px) over which neighbouring ribs magnify. */
const MAG_INFLUENCE = 50;
/** Delay before the shared preview first opens; subsequent moves reposition instantly. */
const TOOLTIP_OPEN_DELAY = 60;

export function ribDimsFor(entry: Pick<SearchNavEntry, 'isEnd'>): RibDims {
  return entry.isEnd ? RIB_END : RIB_MESSAGE;
}

/** Cosine bell: 1 at the pointer, easing to 0 at the influence radius. */
export function magnifyFalloff(distance: number, influence: number): number {
  if (distance >= influence) {
    return 0;
  }
  return 0.5 * (1 + Math.cos((Math.PI * distance) / influence));
}

const indicatorButtonClasses = cn(
  'flex h-1.5 w-full items-center justify-end rounded-sm transition-opacity duration-300',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
);

const dimIndicatorClasses =
  'opacity-40 group-hover/nav:opacity-100 group-focus-within/nav:opacity-100';

const MessageIndicator = memo(function MessageIndicator({
  entry,
  isHighlighted,
  isCurrent,
  label,
  onSelect,
}: {
  entry: SearchNavEntry;
  isHighlighted: boolean;
  isCurrent: boolean;
  label: string;
  onSelect: (id: string) => void;
}) {
  const baseSize = entry.isEnd ? 'mr-[4.5px] h-[3px] w-[3px]' : 'h-[3px] w-3';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entry.id);
      }}
      className={cn(indicatorButtonClasses, isHighlighted ? 'opacity-100' : dimIndicatorClasses)}
      aria-label={label}
      aria-current={isCurrent ? 'true' : undefined}
      data-msg-id={entry.id}
    >
      <span
        className={cn(
          'block rounded-full',
          baseSize,
          isHighlighted ? 'bg-gray-800 dark:bg-gray-100' : 'bg-gray-400 dark:bg-gray-500',
        )}
      />
    </button>
  );
});

const chevronButtonClasses = cn(
  '-mr-1 rounded-md p-0.5 text-text-tertiary opacity-40 transition-[color,opacity] duration-300',
  'group-hover/nav:text-text-secondary group-hover/nav:opacity-100',
  'group-focus-within/nav:text-text-secondary group-focus-within/nav:opacity-100',
  'group-hover/nav:hover:text-text-primary',
  'group-hover/nav:disabled:opacity-30 group-focus-within/nav:disabled:opacity-30',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy',
);

function SearchNav({ entries, currentIndex, visibleIndices, onJump }: SearchNavProps) {
  const localize = useLocalize();

  const columnRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const ribLayoutRef = useRef<
    Array<{ id: string; line: HTMLElement; center: number; dims: RibDims }>
  >([]);
  const pointerYRef = useRef<number | null>(null);
  const magRafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const focusedIdRef = useRef<string | null>(null);
  const tipShownRef = useRef(false);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipElRef = useRef<HTMLDivElement | null>(null);
  const tipPosRef = useRef({ top: 0, right: 0 });

  const [tip, setTip] = useState<{ id: string; top: number; right: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const entryById = useMemo(() => {
    const map = new Map<string, SearchNavEntry>();
    for (let i = 0; i < entries.length; i++) {
      map.set(entries[i].id, entries[i]);
    }
    return map;
  }, [entries]);

  /** Array position of the entry that owns the topmost visible row. Chevron
   *  targets and rail centering both walk the entries list from here. */
  const currentPos = useMemo(() => {
    if (currentIndex == null) {
      return -1;
    }
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i].isEnd && entries[i].index === currentIndex) {
        return i;
      }
    }
    return -1;
  }, [entries, currentIndex]);

  const handleSelect = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const entry = entryById.get(id);
      if (entry) {
        onJump(entry.index, true);
      }
    },
    [entryById, onJump],
  );

  const handleColumnClick = useCallback(() => {
    const id = focusedIdRef.current;
    if (id) {
      handleSelect(id);
    }
  }, [handleSelect]);

  const scrubTo = useCallback(
    (clientY: number) => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      const ribs = col.querySelectorAll<HTMLElement>('[data-msg-id]');
      const count = ribs.length;
      if (count === 0) {
        return;
      }
      const rect = col.getBoundingClientRect();
      const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
      const railIndex = Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
      const id = ribs[railIndex].getAttribute('data-msg-id');
      const entry = id ? entryById.get(id) : undefined;
      if (entry) {
        onJump(entry.index, false);
      }
    },
    [entryById, onJump],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }
      dragCleanupRef.current?.();
      suppressClickRef.current = false;
      const state = { pointerId: e.pointerId, startY: e.clientY, dragging: false };

      const finish = (wasDragging: boolean) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onBlur);
        dragCleanupRef.current = null;
        isDraggingRef.current = false;
        if (wasDragging) {
          suppressClickRef.current = true;
          window.setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }
      };

      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== state.pointerId) {
          return;
        }
        if ((ev.buttons & 1) === 0) {
          finish(state.dragging);
          return;
        }
        if (!state.dragging) {
          if (Math.abs(ev.clientY - state.startY) < DRAG_THRESHOLD) {
            return;
          }
          state.dragging = true;
          isDraggingRef.current = true;
        }
        scrubTo(ev.clientY);
      }

      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== state.pointerId) {
          return;
        }
        finish(state.dragging);
      }

      function onBlur() {
        finish(state.dragging);
      }

      dragCleanupRef.current = () => finish(state.dragging);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
      window.addEventListener('blur', onBlur);
    },
    [scrubTo],
  );

  useEffect(() => () => dragCleanupRef.current?.(), []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const measureRibs = useCallback(() => {
    const col = columnRef.current;
    if (!col) {
      return;
    }
    const colRect = col.getBoundingClientRect();
    const scrollTop = col.scrollTop;
    const layout: Array<{ id: string; line: HTMLElement; center: number; dims: RibDims }> = [];
    const kids = col.children;
    for (let i = 0; i < kids.length; i++) {
      const button = kids[i] as HTMLElement;
      const id = button.getAttribute('data-msg-id');
      const line = button.firstElementChild as HTMLElement | null;
      const entry = id ? entryById.get(id) : undefined;
      if (!id || !line || !entry) {
        continue;
      }
      const rect = button.getBoundingClientRect();
      layout.push({
        id,
        line,
        center: rect.top - colRect.top + scrollTop + rect.height / 2,
        dims: ribDimsFor(entry),
      });
    }
    ribLayoutRef.current = layout;
  }, [entryById]);

  useEffect(() => {
    const raf = requestAnimationFrame(measureRibs);
    const col = columnRef.current;
    const resize = col ? new ResizeObserver(measureRibs) : null;
    if (col && resize) {
      resize.observe(col);
    }
    return () => {
      cancelAnimationFrame(raf);
      resize?.disconnect();
    };
  }, [entries, measureRibs]);

  /** Keep the current position roughly centered in the rail's own scroll area
   *  (the list, not the rail, is the source of scroll here). Skipped mid-drag
   *  so recentering never moves the ribs out from under the pointer. */
  useEffect(() => {
    const col = columnRef.current;
    if (!col || currentPos < 0 || isDraggingRef.current) {
      return;
    }
    const rib = col.children[currentPos] as HTMLElement | undefined;
    if (!rib) {
      return;
    }
    const target = rib.offsetTop - col.clientHeight / 2 + rib.offsetHeight / 2;
    const max = Math.max(0, col.scrollHeight - col.clientHeight);
    col.scrollTop = Math.max(0, Math.min(target, max));
  }, [currentPos]);

  const positionTip = useCallback((top: number, right: number) => {
    tipPosRef.current = { top, right };
    const el = tipElRef.current;
    if (el) {
      el.style.top = `${top}px`;
      el.style.right = `${right}px`;
    }
  }, []);

  const revealTip = useCallback(
    (id: string | null) => {
      if (!id || !entryById.has(id)) {
        setTip(null);
        return;
      }
      setTip({ id, top: tipPosRef.current.top, right: tipPosRef.current.right });
    },
    [entryById],
  );

  const clearTooltip = useCallback(() => {
    if (tipTimerRef.current) {
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
    if (focusedIdRef.current !== null) {
      focusedIdRef.current = null;
      setHoveredId(null);
    }
    if (tipShownRef.current) {
      tipShownRef.current = false;
      setTip(null);
    }
  }, []);

  const focusTooltip = useCallback(
    (id: string, top: number, right: number) => {
      positionTip(top, right);
      if (focusedIdRef.current === id) {
        return;
      }
      focusedIdRef.current = id;
      setHoveredId(id);
      if (tipShownRef.current) {
        revealTip(id);
        return;
      }
      if (tipTimerRef.current) {
        return;
      }
      tipTimerRef.current = setTimeout(() => {
        tipTimerRef.current = null;
        tipShownRef.current = true;
        revealTip(focusedIdRef.current);
      }, TOOLTIP_OPEN_DELAY);
    },
    [positionTip, revealTip],
  );

  const applyMagnify = useCallback(() => {
    magRafRef.current = null;
    const col = columnRef.current;
    const layout = ribLayoutRef.current;
    const py = pointerYRef.current;
    if (!col || py == null || layout.length === 0) {
      return;
    }
    const reduce = reducedMotionRef.current;
    const colRect = col.getBoundingClientRect();
    const scrollTop = col.scrollTop;
    let nearestId: string | null = null;
    let nearestD = Number.POSITIVE_INFINITY;
    let nearestCenter = 0;
    for (let i = 0; i < layout.length; i++) {
      const rib = layout[i];
      const d = Math.abs(py - rib.center);
      if (d < nearestD) {
        nearestD = d;
        nearestId = rib.id;
        nearestCenter = rib.center;
      }
      if (reduce) {
        continue;
      }
      const t = magnifyFalloff(d, MAG_INFLUENCE);
      const dims = rib.dims;
      rib.line.style.transition = 'none';
      rib.line.style.width = `${(dims.baseW + (dims.peakW - dims.baseW) * t).toFixed(2)}px`;
      rib.line.style.height = `${(dims.baseH + (dims.peakH - dims.baseH) * t).toFixed(2)}px`;
    }
    if (nearestId != null && nearestD <= MAG_INFLUENCE && !isDraggingRef.current) {
      const top = colRect.top - scrollTop + nearestCenter;
      const right = window.innerWidth - colRect.left + 8;
      focusTooltip(nearestId, top, right);
    } else {
      clearTooltip();
    }
  }, [focusTooltip, clearTooltip]);

  const resetMagnify = useCallback(() => {
    const layout = ribLayoutRef.current;
    for (let i = 0; i < layout.length; i++) {
      const line = layout[i].line;
      line.style.transition = 'width 140ms ease-out, height 140ms ease-out';
      line.style.width = '';
      line.style.height = '';
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      const rect = col.getBoundingClientRect();
      pointerYRef.current = e.clientY - rect.top + col.scrollTop;
      if (magRafRef.current == null) {
        magRafRef.current = requestAnimationFrame(applyMagnify);
      }
    },
    [applyMagnify],
  );

  const handlePointerLeave = useCallback(() => {
    pointerYRef.current = null;
    if (magRafRef.current != null) {
      cancelAnimationFrame(magRafRef.current);
      magRafRef.current = null;
    }
    resetMagnify();
    clearTooltip();
  }, [resetMagnify, clearTooltip]);

  const handleColumnFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      const target = e.target as HTMLElement;
      if (!col || !target.getAttribute?.('data-msg-id')) {
        return;
      }
      const colRect = col.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      pointerYRef.current = rect.top - colRect.top + col.scrollTop + rect.height / 2;
      if (magRafRef.current == null) {
        magRafRef.current = requestAnimationFrame(applyMagnify);
      }
    },
    [applyMagnify],
  );

  const handleColumnBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      const next = e.relatedTarget as Node | null;
      if (col && next && col.contains(next)) {
        return;
      }
      handlePointerLeave();
    },
    [handlePointerLeave],
  );

  useEffect(
    () => () => {
      if (magRafRef.current != null) {
        cancelAnimationFrame(magRafRef.current);
      }
      if (tipTimerRef.current) {
        clearTimeout(tipTimerRef.current);
      }
    },
    [],
  );

  const canGoUp = currentPos > 0;
  const canGoDown = currentPos >= 0 && currentPos < entries.length - 1;

  const jumpToPrevious = useCallback(() => {
    if (currentPos > 0) {
      onJump(entries[currentPos - 1].index, true);
    }
  }, [currentPos, entries, onJump]);

  const jumpToNext = useCallback(() => {
    if (currentPos >= 0 && currentPos < entries.length - 1) {
      onJump(entries[currentPos + 1].index, true);
    }
  }, [currentPos, entries, onJump]);

  const hasEnd = entries.length > 0 && entries[entries.length - 1].isEnd === true;
  const messageCount = hasEnd ? entries.length - 1 : entries.length;
  if (messageCount < 3) {
    return null;
  }

  const tipEntry = tip ? entryById.get(tip.id) : undefined;
  let tipText = '';
  if (tipEntry) {
    tipText = tipEntry.isEnd ? localize('com_ui_scroll_to_bottom') : tipEntry.preview;
  }

  return (
    <nav
      aria-label={localize('com_ui_search_nav')}
      className={cn(
        'group/nav absolute right-2 top-1/2 z-40 hidden max-h-[min(24rem,calc(100%-2rem))]',
        '-translate-y-1/2 flex-col items-end gap-1.5 px-1.5 py-2 md:flex',
      )}
    >
      <button
        type="button"
        onClick={jumpToPrevious}
        disabled={!canGoUp}
        className={chevronButtonClasses}
        aria-label={localize('com_ui_message_nav_previous')}
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div
        ref={columnRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onFocus={handleColumnFocus}
        onBlur={handleColumnBlur}
        onClick={handleColumnClick}
        className="flex min-h-0 w-14 cursor-pointer touch-none select-none flex-col items-stretch gap-1.5 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {entries.map((entry) => {
          const label = entry.isEnd
            ? localize('com_ui_scroll_to_bottom')
            : localize(
                entry.isUser
                  ? 'com_ui_message_nav_go_to_user'
                  : 'com_ui_message_nav_go_to_assistant',
                { 0: entry.preview.slice(0, 30) },
              );
          const isHighlighted =
            hoveredId != null ? hoveredId === entry.id : visibleIndices.has(entry.index);
          const isCurrent = !entry.isEnd && currentIndex != null && entry.index === currentIndex;
          return (
            <MessageIndicator
              key={entry.id}
              entry={entry}
              isHighlighted={isHighlighted}
              isCurrent={isCurrent}
              onSelect={handleSelect}
              label={label}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={jumpToNext}
        disabled={!canGoDown}
        className={chevronButtonClasses}
        aria-label={localize('com_ui_message_nav_next')}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {tip &&
        createPortal(
          <div
            ref={tipElRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: tip.top,
              right: tip.right,
              transform: 'translateY(-50%)',
              zIndex: 999,
            }}
            className="pointer-events-none max-w-[280px] rounded-md border border-border-medium bg-surface-secondary px-3 py-2 text-text-secondary shadow-lg"
          >
            <p className="line-clamp-3 text-xs">{tipText}</p>
          </div>,
          document.body,
        )}
    </nav>
  );
}

export default memo(SearchNav);
