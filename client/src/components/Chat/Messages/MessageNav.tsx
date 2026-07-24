import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type MessageEntry = {
  id: string;
  isUser: boolean;
  preview: string;
  isEnd?: boolean;
};

const MESSAGES_END_ID = 'messages-end';

export function extractPreviewFromContent(content?: TMessageContentParts[]): string {
  if (!content) {
    return '';
  }
  for (const part of content) {
    if (part?.type !== ContentTypes.TEXT) {
      continue;
    }
    const textField = part.text;
    if (typeof textField === 'string' && textField.trim()) {
      return textField;
    }
    if (textField && typeof textField === 'object' && textField.value?.trim()) {
      return textField.value;
    }
  }
  return '';
}

export function buildEntry(id: string, msg: TMessage): MessageEntry {
  const raw = msg.text?.trim() ? msg.text : extractPreviewFromContent(msg.content);
  const trimmed = raw.trim();
  return {
    id,
    isUser: !!msg.isCreatedByUser,
    preview: trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : ''),
  };
}

const USER_TURN_SELECTOR = '.user-turn';
const STEER_RENDER_CLASS = 'steer-render';
/** One query, document order: steer nodes interleave at their in-thread
 *  position INSIDE the response that absorbed them. */
const ENTRY_NODE_SELECTOR = `.message-render, .${STEER_RENDER_CLASS}`;

/** Rail-relevant node: a message row or an in-thread steer part. The mutation
 *  filter must match BOTH — a steer node swap (optimistic → persisted) or
 *  removal (cancel) produces no `.message-render` mutation at all. */
function isEntryNode(node: HTMLElement): boolean {
  return (
    node.classList?.contains('message-render') === true ||
    node.classList?.contains(STEER_RENDER_CLASS) === true
  );
}

function containsEntryNode(node: HTMLElement): boolean {
  return (
    node.nodeType === 1 && (isEntryNode(node) || node.querySelector?.(ENTRY_NODE_SELECTOR) != null)
  );
}

export function buildFallbackEntry(node: HTMLElement, id: string): MessageEntry {
  const isUser = node.querySelector(USER_TURN_SELECTOR) != null;
  const trimmed = (node.textContent ?? '').trim();
  return {
    id,
    isUser,
    preview: trimmed.slice(0, 80) + (trimmed.length > 80 ? '...' : ''),
  };
}

/** A mid-run steer is a user message, so its rib reads as one; the preview
 *  comes from the part's text body, skipping the author header. */
export function buildSteerEntry(node: HTMLElement, id: string): MessageEntry {
  const raw = (
    node.querySelector('.message-content')?.textContent ??
    node.textContent ??
    ''
  ).trim();
  return {
    id,
    isUser: true,
    preview: raw.slice(0, 80) + (raw.length > 80 ? '...' : ''),
  };
}

function getMessageEntries(root: ParentNode, messagesById: Map<string, TMessage>): MessageEntry[] {
  const nodes = root.querySelectorAll<HTMLElement>(ENTRY_NODE_SELECTOR);
  const entries: MessageEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const id = node.id;
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    if (node.classList.contains(STEER_RENDER_CLASS)) {
      entries.push(buildSteerEntry(node, id));
      continue;
    }
    const msg = messagesById.get(id);
    entries.push(msg ? buildEntry(id, msg) : buildFallbackEntry(node, id));
  }
  if (entries.length > 0 && root.querySelector('#' + MESSAGES_END_ID)) {
    entries.push({ id: MESSAGES_END_ID, isUser: false, preview: '', isEnd: true });
  }
  return entries;
}

const JUMP_EPS = 4;
const SCROLL_DURATION = 400;
const BOTTOM_SNAP_RETRIES = 2;
const DRAG_THRESHOLD = 4;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function readScrollMargin(el: HTMLElement | null): number {
  if (!el) {
    return 0;
  }
  const value = parseFloat(getComputedStyle(el).scrollMarginTop);
  return Number.isFinite(value) ? value : 0;
}

function computeTargetScroll(
  container: HTMLElement,
  el: HTMLElement,
  scrollMargin: number,
): number {
  const cRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const target = container.scrollTop + (elRect.top - cRect.top) - scrollMargin;
  const max = container.scrollHeight - container.clientHeight;
  return Math.max(0, Math.min(target, max));
}

/**
 * An entry's top edge in the scroll container's content space — the same space
 * as `container.scrollTop`. A single `offsetTop` is measured from the nearest
 * positioned ancestor, which for an in-thread steer is the response's `relative`
 * content column, not the scroll content. Mixing that local value with the
 * content-space `offsetTop` of top-level rows compares different origins and
 * breaks every rail decision (jump targets, current row, fisheye centering) the
 * moment the viewport reaches a steer. Summing `offsetTop` up the offsetParent
 * chain until it leaves the container folds any nesting back into one origin;
 * top-level rows collapse to a single hop.
 */
function entryTop(el: HTMLElement, container: HTMLElement): number {
  let top = 0;
  let node: Element | null = el;
  while (node instanceof HTMLElement) {
    top += node.offsetTop;
    const parent = node.offsetParent;
    if (!(parent instanceof HTMLElement) || parent === container || !container.contains(parent)) {
      break;
    }
    node = parent;
  }
  return top;
}

type RibDims = { baseW: number; baseH: number; peakW: number; peakH: number };

const RIB_END: RibDims = { baseW: 3, baseH: 3, peakW: 4.5, peakH: 4.5 };
const RIB_MESSAGE: RibDims = { baseW: 12, baseH: 3, peakW: 39, peakH: 6 };

/** Vertical falloff radius (content-space px) over which neighbouring ribs magnify. */
const MAG_INFLUENCE = 50;
/** Delay before the shared preview first opens; subsequent moves reposition instantly. */
const TOOLTIP_OPEN_DELAY = 60;

export function ribDimsFor(entry: MessageEntry): RibDims {
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
  entry: MessageEntry;
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

function MessageNav({ scrollableRef }: { scrollableRef: React.RefObject<HTMLDivElement> }) {
  const localize = useLocalize();
  const { conversationId } = useMessagesConversation();
  const { isSubmitting } = useMessagesSubmission();
  const { data: messages } = useGetMessagesByConvoId(
    conversationId ?? '',
    {
      enabled: !!conversationId,
    },
    { isStreaming: isSubmitting },
  );
  const messagesById = useMemo(() => {
    const map = new Map<string, TMessage>();
    if (messages) {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.messageId) {
          map.set(m.messageId, m);
        }
      }
    }
    return map;
  }, [messages]);

  const [entries, setEntries] = useState<MessageEntry[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [canGoUp, setCanGoUp] = useState(false);
  const [canGoDown, setCanGoDown] = useState(false);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedRef = useRef(new Map<string, HTMLElement>());
  const columnRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSetRef = useRef(new Set<string>());
  const messagesByIdRef = useRef(messagesById);
  const scrollTokenRef = useRef(0);
  const scrollMarginRef = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const isDraggingRef = useRef(false);

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
    const map = new Map<string, MessageEntry>();
    for (let i = 0; i < entries.length; i++) {
      map.set(entries[i].id, entries[i]);
    }
    return map;
  }, [entries]);

  /** The terminus rib is pinned beside the down chevron rather than living in
   *  the scrolling column, so it stays reachable however far the rail scrolls. */
  const { messageEntries, endEntry } = useMemo(() => {
    const last = entries[entries.length - 1];
    if (last?.isEnd === true) {
      return { messageEntries: entries.slice(0, -1), endEntry: last };
    }
    return { messageEntries: entries, endEntry: null };
  }, [entries]);

  const getCurrentVisibleId = useCallback((): string | null => {
    const container = scrollableRef.current;
    if (!container) {
      return null;
    }
    let nextId: string | null = null;
    let nextTop = Number.POSITIVE_INFINITY;
    for (const id of visibleSetRef.current) {
      const el = observedRef.current.get(id);
      if (!el) {
        continue;
      }
      const top = entryTop(el, container);
      if (top >= nextTop) {
        continue;
      }
      nextId = id;
      nextTop = top;
    }
    return nextId;
  }, [scrollableRef]);

  useEffect(() => {
    messagesByIdRef.current = messagesById;
  }, [messagesById]);

  const resolveEntryEl = useCallback(
    (id: string): HTMLElement | null => {
      if (id === MESSAGES_END_ID) {
        return scrollableRef.current?.querySelector<HTMLElement>('#' + MESSAGES_END_ID) ?? null;
      }
      return document.getElementById(id);
    },
    [scrollableRef],
  );

  /**
   * Re-point the observer at replaced DOM nodes. A steer part swaps its node
   * under the SAME id (optimistic entry → persisted part), which produces no
   * IntersectionObserver exit and — because the entry list dedupes on
   * (id, preview) — no entries change either, so the observer would keep
   * watching a detached node and the rib would stay lit forever. Runs from
   * the mutation-driven refresh regardless of entries identity; visibility is
   * dropped until the fresh node reports (the observer fires its initial
   * intersection immediately on observe, so a truly visible part re-lights
   * within a frame).
   */
  const reconcileObservedElements = useCallback(() => {
    const observer = observerRef.current;
    if (!observer) {
      return;
    }
    const observed = observedRef.current;
    const visibleSet = visibleSetRef.current;
    let visibilityChanged = false;
    for (const [id, el] of [...observed]) {
      const current = resolveEntryEl(id);
      if (current === el) {
        continue;
      }
      observer.unobserve(el);
      if (current) {
        observer.observe(current);
        observed.set(id, current);
      } else {
        observed.delete(id);
      }
      if (visibleSet.delete(id)) {
        visibilityChanged = true;
      }
    }
    if (visibilityChanged) {
      setCurrentId(getCurrentVisibleId());
      setVisibleIds(new Set(visibleSet));
    }
  }, [resolveEntryEl, getCurrentVisibleId]);

  const refreshEntries = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      const root = scrollableRef.current ?? document;
      const next = getMessageEntries(root, messagesByIdRef.current);
      setEntries((prev) => {
        if (
          prev.length === next.length &&
          prev.every((e, i) => e.id === next[i].id && e.preview === next[i].preview)
        ) {
          return prev;
        }
        return next;
      });
      reconcileObservedElements();
    }, 200);
  }, [scrollableRef, reconcileObservedElements]);

  useEffect(() => {
    refreshEntries();
  }, [messagesById, refreshEntries]);

  const scrollToStart = useCallback(
    (id: string) => {
      const el = resolveEntryEl(id);
      if (!el) {
        return;
      }
      const container = el.closest<HTMLElement>('.scrollbar-gutter-stable');
      if (!container) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const token = ++scrollTokenRef.current;
      const scrollMargin = scrollMarginRef.current || readScrollMargin(el);
      const startScroll = container.scrollTop;
      const start = performance.now();

      const step = (now: number) => {
        if (token !== scrollTokenRef.current) {
          return;
        }
        const progress = Math.min(1, (now - start) / SCROLL_DURATION);
        const current = resolveEntryEl(id);
        if (!current) {
          return;
        }
        const clamped = computeTargetScroll(container, current, scrollMargin);
        container.scrollTop = startScroll + (clamped - startScroll) * easeOutCubic(progress);
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      requestAnimationFrame(step);
    },
    [resolveEntryEl],
  );

  const scrollToImmediate = useCallback(
    (id: string) => {
      const el = resolveEntryEl(id);
      if (!el) {
        return;
      }
      const container = el.closest<HTMLElement>('.scrollbar-gutter-stable');
      if (!container) {
        return;
      }
      scrollTokenRef.current++;
      const scrollMargin = scrollMarginRef.current || readScrollMargin(el);
      container.scrollTop = computeTargetScroll(container, el, scrollMargin);
    },
    [resolveEntryEl],
  );

  const focusMessage = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
    el.focus({ preventScroll: true });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      scrollToStart(id);
      if (id !== MESSAGES_END_ID) {
        focusMessage(id);
      }
    },
    [scrollToStart, focusMessage],
  );

  const handleColumnClick = useCallback(() => {
    const id = focusedIdRef.current;
    if (id) {
      handleSelect(id);
    }
  }, [handleSelect]);

  const focusNav = useCallback((): boolean => {
    const nav = navRef.current;
    if (!nav) {
      return false;
    }
    const target =
      nav.querySelector<HTMLElement>('[aria-current="true"]') ??
      nav.querySelector<HTMLElement>('[data-msg-id]');
    if (!target) {
      return false;
    }
    target.focus();
    return document.activeElement === target;
  }, []);

  const scrubTo = useCallback(
    (clientY: number) => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      const rect = col.getBoundingClientRect();
      /** The terminus is pinned below the column, so the pointer reaches it by
       *  travelling past the bottom edge — the proportional mapping covers only
       *  the ribs the column actually spans, or every position lands one late. */
      if (endEntry && clientY >= rect.bottom) {
        scrollToImmediate(MESSAGES_END_ID);
        return;
      }
      const ribs = col.querySelectorAll<HTMLElement>('[data-msg-id]');
      const count = ribs.length;
      if (count === 0) {
        return;
      }
      const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
      const index = Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1))));
      const id = ribs[index].getAttribute('data-msg-id');
      if (id) {
        scrollToImmediate(id);
      }
    },
    [scrollToImmediate, endEntry],
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

  /** The pinned terminus lives outside the column, so it drives the shared
   *  preview itself instead of through the rail's pointer magnification. */
  const showEndTip = useCallback(
    (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const left = columnRef.current?.getBoundingClientRect().left ?? rect.left;
      focusTooltip(MESSAGES_END_ID, rect.top + rect.height / 2, window.innerWidth - left + 8);
    },
    [focusTooltip],
  );

  const handleEndPointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => showEndTip(e.currentTarget),
    [showEndTip],
  );

  const handleEndFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => showEndTip(e.currentTarget),
    [showEndTip],
  );

  const handleEndBlur = useCallback(
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

  useEffect(() => {
    refreshEntries();

    const container = scrollableRef.current;
    if (!container) {
      return;
    }

    const mutationObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'attributes') {
          const target = m.target as HTMLElement;
          if (target.nodeType === 1 && isEntryNode(target)) {
            refreshEntries();
            return;
          }
          continue;
        }
        if (m.addedNodes.length || m.removedNodes.length) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            if (containsEntryNode(m.addedNodes[j] as HTMLElement)) {
              refreshEntries();
              return;
            }
          }
          for (let j = 0; j < m.removedNodes.length; j++) {
            if (containsEntryNode(m.removedNodes[j] as HTMLElement)) {
              refreshEntries();
              return;
            }
          }
        }
      }
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id'],
    });

    return () => {
      mutationObserver.disconnect();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scrollableRef, refreshEntries]);

  useEffect(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      setCanGoUp(false);
      setCanGoDown(false);
      return;
    }

    const offsetsTop: number[] = new Array(entries.length);
    const offsetsBottom: number[] = new Array(entries.length);
    const recomputeOffsets = () => {
      for (let i = 0; i < entries.length; i++) {
        const el = resolveEntryEl(entries[i].id);
        if (!el) {
          offsetsTop[i] = Number.POSITIVE_INFINITY;
          offsetsBottom[i] = Number.POSITIVE_INFINITY;
          continue;
        }
        const top = entryTop(el, container);
        offsetsTop[i] = top;
        offsetsBottom[i] = top + el.offsetHeight;
      }
    };
    recomputeOffsets();

    const firstEl = document.getElementById(entries[0].id);
    const scrollMargin = readScrollMargin(firstEl);
    scrollMarginRef.current = scrollMargin;

    let needsRecompute = false;
    let frameId: number | null = null;
    let bottomFrameId: number | null = null;
    let bottomSnapToken = 0;

    const scrollColumnToBottom = () => {
      const col = columnRef.current;
      if (!col) {
        return;
      }
      col.scrollTop = Math.max(0, col.scrollHeight - col.clientHeight);
    };

    const cancelColumnBottomScroll = () => {
      bottomSnapToken++;
      if (bottomFrameId != null) {
        cancelAnimationFrame(bottomFrameId);
        bottomFrameId = null;
      }
    };

    const scheduleColumnBottomScroll = () => {
      const token = ++bottomSnapToken;
      const run = (remaining: number) => {
        if (token !== bottomSnapToken) {
          return;
        }
        scrollColumnToBottom();
        if (remaining <= 0) {
          bottomFrameId = null;
          return;
        }
        bottomFrameId = requestAnimationFrame(() => run(remaining - 1));
      };
      run(BOTTOM_SNAP_RETRIES);
    };

    const tick = () => {
      frameId = null;
      if (needsRecompute) {
        recomputeOffsets();
        needsRecompute = false;
      }

      const scrollTop = container.scrollTop;
      const containerMaxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      let nextCanUp = false;
      let nextCanDown = false;
      for (let i = 0; i < offsetsTop.length; i++) {
        const snap = Math.min(offsetsTop[i] - scrollMargin, containerMaxScrollTop);
        if (snap < scrollTop - JUMP_EPS) {
          nextCanUp = true;
        } else if (snap > scrollTop + JUMP_EPS) {
          nextCanDown = true;
          break;
        }
      }
      setCanGoUp((prev) => (prev === nextCanUp ? prev : nextCanUp));
      setCanGoDown((prev) => (prev === nextCanDown ? prev : nextCanDown));

      const col = columnRef.current;
      if (!col) {
        return;
      }
      if (containerMaxScrollTop > 0 && scrollTop >= containerMaxScrollTop - JUMP_EPS) {
        scheduleColumnBottomScroll();
        return;
      }
      const viewBottom = scrollTop + container.clientHeight;
      let first = -1;
      let last = -1;
      for (let i = 0; i < offsetsTop.length; i++) {
        if (offsetsBottom[i] <= scrollTop) {
          continue;
        }
        if (offsetsTop[i] >= viewBottom) {
          break;
        }
        if (first === -1) {
          first = i;
        }
        last = i;
      }
      if (first === -1) {
        return;
      }
      if (last === entries.length - 1) {
        scheduleColumnBottomScroll();
        return;
      }
      cancelColumnBottomScroll();
      const firstInd = col.children[first] as HTMLElement | undefined;
      const lastInd = col.children[last] as HTMLElement | undefined;
      if (!firstInd || !lastInd) {
        return;
      }
      const mid = (firstInd.offsetTop + lastInd.offsetTop + lastInd.offsetHeight) / 2;
      const target = mid - col.clientHeight / 2;
      const columnMaxScrollTop = Math.max(0, col.scrollHeight - col.clientHeight);
      col.scrollTop = Math.max(0, Math.min(target, columnMaxScrollTop));
    };

    const scheduleTick = () => {
      if (frameId == null) {
        frameId = requestAnimationFrame(tick);
      }
    };

    const content = container.firstElementChild as HTMLElement | null;
    const resizeObserver = new ResizeObserver(() => {
      needsRecompute = true;
      scheduleTick();
    });
    if (content) {
      resizeObserver.observe(content);
    }

    tick();
    container.addEventListener('scroll', scheduleTick, { passive: true });

    return () => {
      container.removeEventListener('scroll', scheduleTick);
      if (frameId != null) {
        cancelAnimationFrame(frameId);
      }
      cancelColumnBottomScroll();
      resizeObserver.disconnect();
    };
  }, [entries, scrollableRef, resolveEntryEl]);

  useEffect(() => {
    const root = scrollableRef.current;
    if (!root) {
      return;
    }

    const visibleSet = visibleSetRef.current;
    const observed = observedRef.current;
    let pendingFrame: number | null = null;

    const flush = () => {
      pendingFrame = null;
      const nextCurrentId = getCurrentVisibleId();
      setCurrentId((prev) => (prev === nextCurrentId ? prev : nextCurrentId));
      setVisibleIds((prev) => {
        if (prev.size === visibleSet.size) {
          let same = true;
          for (const id of visibleSet) {
            if (!prev.has(id)) {
              same = false;
              break;
            }
          }
          if (same) {
            return prev;
          }
        }
        return new Set(visibleSet);
      });
    };

    const observer = new IntersectionObserver(
      (intersections) => {
        for (const entry of intersections) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            visibleSet.add(id);
          } else {
            visibleSet.delete(id);
          }
        }
        if (pendingFrame == null) {
          pendingFrame = requestAnimationFrame(flush);
        }
      },
      { root, threshold: 0 },
    );
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      observed.clear();
      visibleSet.clear();
      if (pendingFrame != null) {
        cancelAnimationFrame(pendingFrame);
      }
    };
  }, [getCurrentVisibleId, scrollableRef]);

  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) {
      return;
    }
    const observed = observedRef.current;
    const visibleSet = visibleSetRef.current;

    const elementByNewId = new Map<HTMLElement, string>();
    for (let i = 0; i < entries.length; i++) {
      const id = entries[i].id;
      const el = resolveEntryEl(id);
      if (el) {
        elementByNewId.set(el, id);
      }
    }

    let visibilityChanged = false;
    for (const [oldId, el] of [...observed]) {
      const newId = elementByNewId.get(el);
      if (newId === undefined) {
        observer.unobserve(el);
        observed.delete(oldId);
        if (visibleSet.delete(oldId)) {
          visibilityChanged = true;
        }
        continue;
      }
      if (newId !== oldId) {
        observed.delete(oldId);
        observed.set(newId, el);
        if (visibleSet.delete(oldId)) {
          visibleSet.add(newId);
          visibilityChanged = true;
        }
      }
    }

    for (const [el, id] of elementByNewId) {
      if (!observed.has(id)) {
        observer.observe(el);
        observed.set(id, el);
      }
    }

    if (visibilityChanged) {
      setCurrentId(getCurrentVisibleId());
      setVisibleIds(new Set(visibleSet));
    }
  }, [entries, getCurrentVisibleId, resolveEntryEl]);

  const jumpToPrevious = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      return;
    }
    const scrollTop = container.scrollTop;
    const scrollMargin =
      scrollMarginRef.current !== 0
        ? scrollMarginRef.current
        : readScrollMargin(document.getElementById(entries[0].id));
    for (let i = entries.length - 1; i >= 0; i--) {
      const el = resolveEntryEl(entries[i].id);
      if (!el) {
        continue;
      }
      if (entryTop(el, container) - scrollMargin < scrollTop - JUMP_EPS) {
        scrollToStart(entries[i].id);
        return;
      }
    }
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [entries, scrollableRef, scrollToStart, resolveEntryEl]);

  const jumpToNext = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      return;
    }
    const scrollTop = container.scrollTop;
    const scrollMargin =
      scrollMarginRef.current !== 0
        ? scrollMarginRef.current
        : readScrollMargin(document.getElementById(entries[0].id));
    for (let i = 0; i < entries.length; i++) {
      const el = resolveEntryEl(entries[i].id);
      if (!el) {
        continue;
      }
      if (entryTop(el, container) - scrollMargin > scrollTop + JUMP_EPS) {
        scrollToStart(entries[i].id);
        return;
      }
    }
  }, [entries, scrollableRef, scrollToStart, resolveEntryEl]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.code === 'KeyM' || e.key.toLowerCase() === 'm')) {
        if (focusNav()) {
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusNav]);

  if (messageEntries.length < 3) {
    return null;
  }

  const tipEntry = tip ? entryById.get(tip.id) : undefined;
  let tipText = '';
  if (tipEntry) {
    tipText = tipEntry.isEnd ? localize('com_ui_scroll_to_bottom') : tipEntry.preview;
  }

  return (
    <nav
      ref={navRef}
      aria-label={localize('com_ui_message_nav')}
      aria-keyshortcuts="Shift+Alt+M"
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
        {messageEntries.map((entry) => {
          const label = localize(
            entry.isUser ? 'com_ui_message_nav_go_to_user' : 'com_ui_message_nav_go_to_assistant',
            { 0: entry.preview.slice(0, 30) },
          );
          const isHighlighted =
            hoveredId != null ? hoveredId === entry.id : visibleIds.has(entry.id);
          return (
            <MessageIndicator
              key={entry.id}
              entry={entry}
              isHighlighted={isHighlighted}
              isCurrent={currentId === entry.id}
              onSelect={handleSelect}
              label={label}
            />
          );
        })}
      </div>

      {endEntry && (
        <div
          className="flex w-14 cursor-pointer touch-none select-none flex-col items-stretch"
          onPointerDown={handlePointerDown}
          onPointerEnter={handleEndPointerEnter}
          onPointerLeave={clearTooltip}
          onFocus={handleEndFocus}
          onBlur={handleEndBlur}
        >
          <MessageIndicator
            entry={endEntry}
            isHighlighted={
              hoveredId != null ? hoveredId === endEntry.id : visibleIds.has(endEntry.id)
            }
            isCurrent={currentId === endEntry.id}
            onSelect={handleSelect}
            label={localize('com_ui_scroll_to_bottom')}
          />
        </div>
      )}

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

export default memo(MessageNav);
