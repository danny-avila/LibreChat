import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { RailEntry, RailWindow } from './types';
import type { RibDims } from './geometry';
import {
  ribDimsFor,
  magnifyFalloff,
  DRAG_THRESHOLD,
  MAG_INFLUENCE,
  TOOLTIP_OPEN_DELAY,
} from './geometry';
import { Indicator, chevronButtonClasses } from './Indicator';
import { cn } from '~/utils';

const BOTTOM_SNAP_RETRIES = 2;

export interface RailProps {
  ariaLabel: string;
  /** Ribs that live in the scrolling column, in reading order. */
  entries: RailEntry[];
  /** Pinned above and below the column. Either may be absent; the terminus is
   *  pinned rather than scrolled so it stays reachable however far the column
   *  has travelled, and the origin mirrors it for the same reason. */
  startEntry?: RailEntry | null;
  endEntry?: RailEntry | null;
  /** The single "you are here" mark. May name a pinned entry. */
  currentId: string | null;
  /** The soft band of entries on screen around the current one. */
  visibleIds: ReadonlySet<string>;
  /** Which entries the rail should keep framed; see `RailWindow`. */
  railWindow?: RailWindow | null;
  canGoUp: boolean;
  canGoDown: boolean;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  /** Deliberate activation: a click, Enter, or the pinned ribs. */
  onSelect: (id: string) => void;
  /** Continuous activation during a scrub, which should not animate. */
  onScrub: (id: string) => void;
  labelFor: (entry: RailEntry) => string;
  previewFor: (entry: RailEntry) => string;
  /** Shortcut advertised on the nav, and honoured by the owner. */
  keyShortcuts?: string;
  navRef?: React.RefObject<HTMLElement>;
}

/**
 * The navigation rail: a column of ribs with a fisheye, a shared preview, a
 * drag scrub and a pair of chevrons.
 *
 * It owns every question of the form "which rib is the pointer on" and answers
 * all of them from one measured layout, in the column's own content space, so
 * the rib under the pointer, the message named in the preview and the message a
 * drag lands on cannot disagree. It owns nothing about what the ribs mean:
 * where the reader currently is, what is on screen, and what activating a rib
 * should do all arrive as props, which is what lets the transcript and the
 * search results share one rail instead of two copies that drift.
 */
function Rail({
  ariaLabel,
  entries,
  startEntry = null,
  endEntry = null,
  currentId,
  visibleIds,
  railWindow = null,
  canGoUp,
  canGoDown,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onSelect,
  onScrub,
  labelFor,
  previewFor,
  keyShortcuts,
  navRef,
}: RailProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const isDraggingRef = useRef(false);
  /** True while the pointer or the keyboard is working the rail; freezes the
   *  rail's auto-follow so the ribs stay put under an active gesture. A ref
   *  because the pointer sets it on every move, and re-rendering for that would
   *  cost more than the freeze saves. */
  const interactingRef = useRef(false);
  /** Bumped when a gesture ends. Releasing the rail has to re-run the follow
   *  effect, and a ref alone cannot: if the window has not changed since the
   *  gesture began — a drag that reached the end, say — the owner hands back
   *  the same object, so nothing re-runs and the column stays where the reader
   *  left it with the current ribs off-screen. */
  const [settleToken, setSettleToken] = useState(0);

  const ribLayoutRef = useRef<
    Array<{ id: string; line: HTMLElement; center: number; dims: RibDims }>
  >([]);
  const measuredCountRef = useRef(-1);
  const measuredCurrentRef = useRef<string | null | undefined>(undefined);
  /** The pointer's VIEWPORT y, converted to the column's content space only at
   *  the moment it is used. Caching the converted value goes stale the instant
   *  the rail is wheel-scrolled under a stationary pointer, leaving the preview
   *  — and the id a click in the gaps follows — on the rib that used to be
   *  there. */
  const pointerClientYRef = useRef<number | null>(null);
  const magRafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const focusedIdRef = useRef<string | null>(null);
  const tipShownRef = useRef(false);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipElRef = useRef<HTMLDivElement | null>(null);
  const tipPosRef = useRef({ top: 0, right: 0 });

  const [tip, setTip] = useState<{ id: string; top: number; right: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** The rib the keyboard last landed on. A roving tab stop has to travel with
   *  focus, not sit on the current rib: leave it behind and the column holds
   *  two tab stops, so Tab re-enters the rail it just left and Shift+Tab walks
   *  back into it instead of out. Distinct from `hoveredId`, which the pointer
   *  also drives — the tab order must not follow the mouse. */
  const [focusedRibId, setFocusedRibId] = useState<string | null>(null);

  const entryById = useMemo(() => {
    const map = new Map<string, RailEntry>();
    for (let i = 0; i < entries.length; i++) {
      map.set(entries[i].id, entries[i]);
    }
    if (startEntry) {
      map.set(startEntry.id, startEntry);
    }
    if (endEntry) {
      map.set(endEntry.id, endEntry);
    }
    return map;
  }, [entries, startEntry, endEntry]);

  const measureRibs = useCallback(() => {
    const col = columnRef.current;
    if (!col) {
      return;
    }
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
      layout.push({
        id,
        line,
        center: button.offsetTop + button.offsetHeight / 2,
        dims: ribDimsFor(entry, id === currentId),
      });
    }
    measuredCountRef.current = kids.length;
    measuredCurrentRef.current = currentId;
    ribLayoutRef.current = layout;
  }, [entryById, currentId]);

  /** Re-measures when the rib set or the current rib has changed since the last
   *  measurement, so a gesture that arrives before the scheduled measure still
   *  hit-tests against the ribs on screen and releases them to the resting size
   *  they are actually rendered at. */
  const ensureRibLayout = useCallback(() => {
    const col = columnRef.current;
    if (!col) {
      return;
    }
    if (
      measuredCountRef.current !== col.children.length ||
      measuredCurrentRef.current !== currentId
    ) {
      measureRibs();
    }
  }, [measureRibs, currentId]);

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
  }, [entries, currentId, measureRibs]);

  const handleSelect = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelect(id);
    },
    [onSelect],
  );

  const handleColumnClick = useCallback(() => {
    const id = focusedIdRef.current;
    if (id) {
      handleSelect(id);
    }
  }, [handleSelect]);

  const ribIdAt = useCallback(
    (clientY: number): string | null => {
      ensureRibLayout();
      const col = columnRef.current;
      const layout = ribLayoutRef.current;
      if (!col || layout.length === 0) {
        return null;
      }
      const contentY = clientY - col.getBoundingClientRect().top + col.scrollTop;
      let nearestId: string | null = null;
      let nearestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < layout.length; i++) {
        const d = Math.abs(contentY - layout[i].center);
        if (d >= nearestD) {
          continue;
        }
        nearestD = d;
        nearestId = layout[i].id;
      }
      return nearestId;
    },
    [ensureRibLayout],
  );

  const scrubTo = useCallback(
    (clientY: number) => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      const rect = col.getBoundingClientRect();
      /** The terminus ribs are pinned outside the column, so the pointer reaches
       *  them by travelling past its edges. */
      if (endEntry && clientY >= rect.bottom) {
        onScrub(endEntry.id);
        return;
      }
      if (startEntry && clientY <= rect.top) {
        onScrub(startEntry.id);
        return;
      }
      const id = ribIdAt(clientY);
      if (id) {
        onScrub(id);
      }
    },
    [onScrub, ribIdAt, endEntry, startEntry],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) {
        return;
      }
      dragCleanupRef.current?.();
      suppressClickRef.current = false;
      interactingRef.current = true;
      const state = { pointerId: e.pointerId, startY: e.clientY, dragging: false };

      const finish = (wasDragging: boolean) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onBlur);
        dragCleanupRef.current = null;
        isDraggingRef.current = false;
        if (pointerClientYRef.current == null) {
          interactingRef.current = false;
          setSettleToken((n) => n + 1);
        }
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

  /** A rib hovered or focused moments before the rail unmounts leaves a queued
   *  frame and a pending preview timer behind, both of which would fire against
   *  a component that is gone. Leaving search, or switching conversations, is
   *  exactly that transition. */
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

  /** The pinned origin and terminus live outside the column, so they drive the
   *  shared preview themselves instead of through the rail's magnification. */
  const showTerminusTip = useCallback(
    (el: HTMLElement, id: string) => {
      const rect = el.getBoundingClientRect();
      const left = columnRef.current?.getBoundingClientRect().left ?? rect.left;
      focusTooltip(id, rect.top + rect.height / 2, window.innerWidth - left + 8);
    },
    [focusTooltip],
  );

  const handleEndPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) =>
      endEntry && showTerminusTip(e.currentTarget, endEntry.id),
    [showTerminusTip, endEntry],
  );

  const handleEndFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) =>
      endEntry && showTerminusTip(e.currentTarget, endEntry.id),
    [showTerminusTip, endEntry],
  );

  const handleStartPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) =>
      startEntry && showTerminusTip(e.currentTarget, startEntry.id),
    [showTerminusTip, startEntry],
  );

  const handleStartFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) =>
      startEntry && showTerminusTip(e.currentTarget, startEntry.id),
    [showTerminusTip, startEntry],
  );

  const handleTerminusBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) {
        return;
      }
      clearTooltip();
    },
    [clearTooltip],
  );

  const applyMagnify = useCallback(() => {
    magRafRef.current = null;
    ensureRibLayout();
    const col = columnRef.current;
    const layout = ribLayoutRef.current;
    const clientY = pointerClientYRef.current;
    if (!col || clientY == null || layout.length === 0) {
      return;
    }
    const reduce = reducedMotionRef.current;
    const colRect = col.getBoundingClientRect();
    const scrollTop = col.scrollTop;
    const py = clientY - colRect.top + scrollTop;
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
  }, [focusTooltip, clearTooltip, ensureRibLayout]);

  /** Restores the resting dimensions rather than clearing them: the ribs carry
   *  their base size inline, from the same `ribDimsFor` the magnifier reads, so
   *  there is one source of truth for a rib's size and no snap on release. */
  const resetMagnify = useCallback(() => {
    ensureRibLayout();
    const layout = ribLayoutRef.current;
    for (let i = 0; i < layout.length; i++) {
      const rib = layout[i];
      rib.line.style.transition = 'width 140ms ease-out, height 140ms ease-out';
      rib.line.style.width = `${rib.dims.baseW}px`;
      rib.line.style.height = `${rib.dims.baseH}px`;
    }
  }, [ensureRibLayout]);

  /** At most one magnification pass per frame, whoever asks for it: the pointer
   *  moving, the rail scrolling under a still pointer, or focus landing on a rib. */
  const scheduleMagnify = useCallback(() => {
    if (magRafRef.current == null) {
      magRafRef.current = requestAnimationFrame(applyMagnify);
    }
  }, [applyMagnify]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      interactingRef.current = true;
      pointerClientYRef.current = e.clientY;
      scheduleMagnify();
    },
    [scheduleMagnify],
  );

  /** Wheeling the rail moves the ribs without moving the pointer, so the hit
   *  test has to be redone from the same viewport coordinate against the new
   *  scroll offset. */
  const handleColumnScroll = useCallback(() => {
    if (pointerClientYRef.current == null) {
      return;
    }
    scheduleMagnify();
  }, [scheduleMagnify]);

  const endInteraction = useCallback(() => {
    interactingRef.current = false;
    setSettleToken((n) => n + 1);
  }, []);

  const handlePointerLeave = useCallback(() => {
    pointerClientYRef.current = null;
    if (!isDraggingRef.current) {
      endInteraction();
    }
    if (magRafRef.current != null) {
      cancelAnimationFrame(magRafRef.current);
      magRafRef.current = null;
    }
    resetMagnify();
    clearTooltip();
  }, [resetMagnify, clearTooltip, endInteraction]);

  const handleColumnFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      const target = e.target as HTMLElement;
      const id = target.getAttribute?.('data-msg-id');
      if (!col || id == null) {
        return;
      }
      setFocusedRibId(id);
      interactingRef.current = true;
      const rect = target.getBoundingClientRect();
      pointerClientYRef.current = rect.top + rect.height / 2;
      scheduleMagnify();
    },
    [scheduleMagnify],
  );

  const handleColumnBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const col = columnRef.current;
      const next = e.relatedTarget as Node | null;
      if (col && next && col.contains(next)) {
        return;
      }
      setFocusedRibId(null);
      handlePointerLeave();
    },
    [handlePointerLeave],
  );
  const handleColumnKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const col = columnRef.current;
    if (!col) {
      return;
    }
    const { key } = e;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Home' && key !== 'End') {
      return;
    }
    const ribs = col.querySelectorAll<HTMLElement>('[data-msg-id]');
    if (ribs.length === 0) {
      return;
    }
    let index = -1;
    for (let i = 0; i < ribs.length; i++) {
      if (ribs[i] === document.activeElement) {
        index = i;
        break;
      }
    }
    let next = 0;
    if (key === 'End') {
      next = ribs.length - 1;
    } else if (key === 'ArrowUp') {
      next = index <= 0 ? 0 : index - 1;
    } else if (key === 'ArrowDown') {
      next = index < 0 ? 0 : Math.min(ribs.length - 1, index + 1);
    }
    e.preventDefault();
    ribs[next].focus();
  }, []);

  /**
   * Keep the reader's window framed in the rail's own scroll area.
   *
   * `offsetTop` is content-space only because the column is a positioned
   * ancestor; without that it resolves against the absolutely positioned `nav`
   * and every centring decision inherits the chevron's height. The rail holds
   * still while the pointer or the keyboard is working it — re-centring under
   * an active pointer slides the ribs out from under it mid-gesture, and it
   * would also discard any wheel scroll the reader did to reach a distant part
   * of a list too long for one column.
   */
  useEffect(() => {
    const col = columnRef.current;
    if (!col || !railWindow || interactingRef.current) {
      return;
    }
    let frameId: number | null = null;
    let token = 0;

    const scrollToBottom = () => {
      col.scrollTop = Math.max(0, col.scrollHeight - col.clientHeight);
    };

    if (railWindow.atEnd) {
      /** The column's own height settles a frame or two after the entries do,
       *  so a single write can land against a stale scrollHeight. */
      const mine = ++token;
      const run = (remaining: number) => {
        if (mine !== token) {
          return;
        }
        scrollToBottom();
        if (remaining <= 0) {
          frameId = null;
          return;
        }
        frameId = requestAnimationFrame(() => run(remaining - 1));
      };
      run(BOTTOM_SNAP_RETRIES);
      return () => {
        token++;
        if (frameId != null) {
          cancelAnimationFrame(frameId);
        }
      };
    }

    const firstRib = col.children[railWindow.first] as HTMLElement | undefined;
    const lastRib = col.children[railWindow.last] as HTMLElement | undefined;
    if (!firstRib || !lastRib) {
      return;
    }
    const mid = (firstRib.offsetTop + lastRib.offsetTop + lastRib.offsetHeight) / 2;
    const target = mid - col.clientHeight / 2;
    const max = Math.max(0, col.scrollHeight - col.clientHeight);
    col.scrollTop = Math.max(0, Math.min(target, max));
    /** `entries` is the rail's content-size signal. A reader pinned at the
     *  bottom of a streaming thread keeps the same window — it was already
     *  `atEnd` — while each appended rib grows the column underneath them, so
     *  without this the newest ribs settle below the viewport and stay there
     *  until some later interaction happens to change the window. */
  }, [railWindow, settleToken, entries]);

  if (entries.length === 0) {
    return null;
  }

  const tipEntry = tip ? entryById.get(tip.id) : undefined;
  const tipText = tipEntry ? previewFor(tipEntry) : '';

  /** One tab stop for the whole column; the arrows move within it. It rides the
   *  focused rib while the keyboard is in the rail, and otherwise the current
   *  one, so Tab lands where the reader already is — and when current names a
   *  pinned rib, on the nearest end of the column rather than back at the top. */
  let rovingId = entries[0].id;
  if (currentId === endEntry?.id) {
    rovingId = entries[entries.length - 1].id;
  } else if (currentId != null && entryById.has(currentId)) {
    rovingId = currentId;
  }
  if (focusedRibId != null && entryById.has(focusedRibId)) {
    rovingId = focusedRibId;
  }

  /** The terminus is a real entry that the owner's observer reports on, so its
   *  band membership arrives with the rest. The origin has no row of its own,
   *  and "there is nothing above you" is the only evidence that it has been
   *  reached — which is exactly what an exhausted up chevron means. */
  const renderPinned = (
    entry: RailEntry,
    handlers: {
      onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => void;
      onFocus: (e: React.FocusEvent<HTMLDivElement>) => void;
    },
    reached = false,
  ) => (
    <div
      className="flex w-14 cursor-pointer touch-none select-none flex-col items-stretch"
      onPointerDown={handlePointerDown}
      onPointerEnter={handlers.onPointerEnter}
      onPointerLeave={clearTooltip}
      onFocus={handlers.onFocus}
      onBlur={handleTerminusBlur}
    >
      <Indicator
        entry={entry}
        isInView={reached || visibleIds.has(entry.id)}
        isCurrent={currentId === entry.id}
        isFocused={hoveredId === entry.id}
        tabIndex={0}
        onSelect={handleSelect}
        label={labelFor(entry)}
      />
    </div>
  );

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      aria-keyshortcuts={keyShortcuts}
      className={cn(
        'group/nav absolute right-2 top-1/2 z-40 hidden max-h-[min(24rem,calc(100%-2rem))]',
        '-translate-y-1/2 flex-col items-end gap-1.5 px-1.5 py-2 md:flex',
      )}
    >
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoUp}
        className={chevronButtonClasses}
        aria-label={previousLabel}
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      {startEntry &&
        renderPinned(
          startEntry,
          { onPointerEnter: handleStartPointerEnter, onFocus: handleStartFocus },
          !canGoUp,
        )}

      <div
        ref={columnRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onFocus={handleColumnFocus}
        onBlur={handleColumnBlur}
        onClick={handleColumnClick}
        onKeyDown={handleColumnKeyDown}
        onScroll={handleColumnScroll}
        data-message-nav-column=""
        className="relative flex min-h-0 w-14 cursor-pointer touch-none select-none flex-col items-stretch gap-1.5 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {entries.map((entry) => (
          <Indicator
            key={entry.id}
            entry={entry}
            isInView={visibleIds.has(entry.id)}
            isCurrent={currentId === entry.id}
            isFocused={hoveredId === entry.id}
            tabIndex={entry.id === rovingId ? 0 : -1}
            onSelect={handleSelect}
            label={labelFor(entry)}
          />
        ))}
      </div>

      {endEntry &&
        renderPinned(endEntry, {
          onPointerEnter: handleEndPointerEnter,
          onFocus: handleEndFocus,
        })}

      <button
        type="button"
        onClick={onNext}
        disabled={!canGoDown}
        className={chevronButtonClasses}
        aria-label={nextLabel}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {tip &&
        tipText !== '' &&
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

export default memo(Rail);
