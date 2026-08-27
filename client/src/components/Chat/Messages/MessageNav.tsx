import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import type { RailWindow } from './Rail';
import { useMessagesConversation, useMessagesSubmission } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Rail } from './Rail';

type MessageEntry = {
  id: string;
  isUser: boolean;
  preview: string;
  isEnd?: boolean;
  isStart?: boolean;
};

const MESSAGES_END_ID = 'messages-end';
/** The origin rib has no row of its own — it targets the top of the scroll
 *  container, mirroring the terminus that targets `#messages-end`. */
const MESSAGES_START_ID = 'messages-start';

function isTerminusId(id: string): boolean {
  return id === MESSAGES_END_ID || id === MESSAGES_START_ID;
}

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

const PREVIEW_LIMIT = 80;

function truncatePreview(text: string): string {
  return text.slice(0, PREVIEW_LIMIT) + (text.length > PREVIEW_LIMIT ? '...' : '');
}

/** The row's message body, without its header or footer. An assistant row
 *  renders a VISIBLE `h2` naming the sender, so reading the whole row hands
 *  back "Claude" for a response that has not produced a token yet — chrome
 *  masquerading as content, and worse, masking the pending state entirely. */
const MESSAGE_BODY_SELECTOR = '[data-testid="message-body"]';

/** What a row actually says on screen, for entries whose message carries no
 *  text part of its own. */
function rowText(node: HTMLElement): string {
  const body = node.querySelector(MESSAGE_BODY_SELECTOR);
  return ((body ?? node).textContent ?? '').trim();
}

export function buildEntry(id: string, msg: TMessage, node?: HTMLElement): MessageEntry {
  const raw = msg.text?.trim() ? msg.text : extractPreviewFromContent(msg.content);
  const trimmed = raw.trim();
  /** Image-, tool-call- and reasoning-only messages carry no text part at all,
   *  so the message alone yields nothing to say. Their rendered body does say
   *  something, and reading it is what keeps a settled message from being
   *  mistaken for one that is still generating. */
  const preview = trimmed === '' && node ? rowText(node) : trimmed;
  return {
    id,
    isUser: !!msg.isCreatedByUser,
    preview: truncatePreview(preview),
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
  return {
    id,
    isUser,
    preview: truncatePreview(rowText(node)),
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
    preview: truncatePreview(raw),
  };
}

type LocalizeFn = ReturnType<typeof useLocalize>;

/**
 * What a rib says it will take you to.
 *
 * A response enters the rail the instant its row mounts, which is one frame
 * before its first token, so falling through to the raw preview there labelled
 * the rib with nothing and opened an empty preview card beside it. Only the
 * tail of a live submission earns the pending wording, though: an empty preview
 * is not evidence of generation, and a reopened thread whose rows are settled
 * would otherwise announce "Generating" forever.
 */
export function previewTextFor(
  entry: MessageEntry,
  localize: LocalizeFn,
  isPending = false,
): string {
  if (entry.isStart === true) {
    return localize('com_ui_scroll_to_top');
  }
  if (entry.isEnd === true) {
    return localize('com_ui_scroll_to_bottom');
  }
  if (entry.preview !== '') {
    return entry.preview;
  }
  return localize(isPending ? 'com_ui_generating' : 'com_ui_message_nav_no_preview');
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
    entries.push(msg ? buildEntry(id, msg, node) : buildFallbackEntry(node, id));
  }
  if (entries.length > 0 && root.querySelector('#' + MESSAGES_END_ID)) {
    entries.push({ id: MESSAGES_END_ID, isUser: false, preview: '', isEnd: true });
  }
  return entries;
}

const JUMP_EPS = 4;
const SCROLL_DURATION = 400;

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

/**
 * Where the container lands when an entry is snapped to the top, clamped to the
 * range it can actually reach.
 *
 * The rows carry `scroll-margin-top: 4rem` against `pt-14` of content padding,
 * so the first entry's raw snap point is -8px. Compared unclamped it reads as
 * "there is still something above you" at the very top of every conversation,
 * which left the up chevron live with nowhere to go and the origin rib showing
 * as out of view while the reader sat at the top.
 */
function snapPointFor(top: number, scrollMargin: number, maxScrollTop: number): number {
  return Math.max(0, Math.min(top - scrollMargin, maxScrollTop));
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
  const [railWindow, setRailWindow] = useState<RailWindow | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedRef = useRef(new Map<string, HTMLElement>());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSetRef = useRef(new Set<string>());
  const messagesByIdRef = useRef(messagesById);
  const scrollTokenRef = useRef(0);
  const scrollMarginRef = useRef(0);
  const navRef = useRef<HTMLElement>(null);

  /** The terminus rib is pinned beside the down chevron rather than living in
   *  the scrolling column, so it stays reachable however far the rail scrolls.
   *  The origin rib is its mirror above the column, for the same reason: in a
   *  long thread the top of the conversation scrolls out of the rail itself.
   *
   *  Only the terminus is ever `aria-current`: it is a real entry (`#messages-end`
   *  closes the thread), whereas the origin is a control with no row of its own,
   *  and marking both would put two current items in one nav. */
  const { messageEntries, endEntry, startEntry } = useMemo(() => {
    const last = entries[entries.length - 1];
    const hasEnd = last?.isEnd === true;
    const messageEntries = hasEnd ? entries.slice(0, -1) : entries;
    return {
      messageEntries,
      endEntry: hasEnd ? last : null,
      startEntry:
        messageEntries.length > 0
          ? { id: MESSAGES_START_ID, isUser: false, preview: '', isStart: true }
          : null,
    };
  }, [entries]);

  /**
   * Rib centres in the column's own content space, plus the resting size each
   * rib returns to. Everything that answers "which rib is the pointer on" —
   * the fisheye, the preview, a click in the gaps, a drag — reads this one
   * layout, so they cannot disagree.
   */

  useEffect(() => {
    messagesByIdRef.current = messagesById;
  }, [messagesById]);

  const resolveEntryEl = useCallback(
    (id: string): HTMLElement | null => {
      if (id === MESSAGES_START_ID) {
        return null;
      }
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
      setVisibleIds(new Set(visibleSet));
    }
  }, [resolveEntryEl]);

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
      if (id === MESSAGES_START_ID) {
        scrollTokenRef.current++;
        scrollableRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
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
    [resolveEntryEl, scrollableRef],
  );

  const scrollToImmediate = useCallback(
    (id: string) => {
      if (id === MESSAGES_START_ID) {
        scrollTokenRef.current++;
        const container = scrollableRef.current;
        if (container) {
          container.scrollTop = 0;
        }
        return;
      }
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
    [resolveEntryEl, scrollableRef],
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
      scrollToStart(id);
      if (!isTerminusId(id)) {
        focusMessage(id);
      }
    },
    [scrollToStart, focusMessage],
  );

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
      /**
       * The rail's "you are here" is a scroll-spy over entry spans, not the set
       * of rows the IntersectionObserver reports. A response tall enough to fill
       * the viewport keeps intersecting for screens on end, and an in-thread
       * steer follows its response in document order while sitting *inside* it —
       * so "topmost intersecting row" lights a rib several places short of the
       * end while the reader is looking at the very bottom of the thread. The
       * last entry whose snap point has passed the viewport top is the one being
       * read, and at the bottom every snap clamps to the maximum scroll, which
       * lands current on the terminus.
       */
      let currentIndex = -1;
      for (let i = 0; i < offsetsTop.length; i++) {
        if (offsetsTop[i] === Number.POSITIVE_INFINITY) {
          continue;
        }
        const snap = snapPointFor(offsetsTop[i], scrollMargin, containerMaxScrollTop);
        if (snap > scrollTop + JUMP_EPS) {
          nextCanDown = true;
          break;
        }
        currentIndex = i;
        if (snap < scrollTop - JUMP_EPS) {
          nextCanUp = true;
        }
      }
      if (containerMaxScrollTop <= 0) {
        currentIndex = 0;
      }
      const nextCurrentId = entries[currentIndex < 0 ? 0 : currentIndex]?.id ?? null;
      setCanGoUp((prev) => (prev === nextCanUp ? prev : nextCanUp));
      setCanGoDown((prev) => (prev === nextCanDown ? prev : nextCanDown));
      setCurrentId((prev) => (prev === nextCurrentId ? prev : nextCurrentId));

      /** Which entries the reader can see. The rail frames this itself; all it
       *  needs from the transcript is the span, in entry indices. */
      if (containerMaxScrollTop > 0 && scrollTop >= containerMaxScrollTop - JUMP_EPS) {
        setRailWindow((prev) => (prev?.atEnd === true ? prev : { first: 0, last: 0, atEnd: true }));
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
      const atEnd = last === entries.length - 1;
      setRailWindow((prev) =>
        prev != null && prev.first === first && prev.last === last && prev.atEnd === atEnd
          ? prev
          : { first, last, atEnd },
      );
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
  }, [scrollableRef]);

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
      setVisibleIds(new Set(visibleSet));
    }
  }, [entries, resolveEntryEl]);

  const jumpToPrevious = useCallback(() => {
    const container = scrollableRef.current;
    if (!container || entries.length === 0) {
      return;
    }
    const scrollTop = container.scrollTop;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const scrollMargin =
      scrollMarginRef.current !== 0
        ? scrollMarginRef.current
        : readScrollMargin(document.getElementById(entries[0].id));
    for (let i = entries.length - 1; i >= 0; i--) {
      const el = resolveEntryEl(entries[i].id);
      if (!el) {
        continue;
      }
      if (
        snapPointFor(entryTop(el, container), scrollMargin, maxScrollTop) <
        scrollTop - JUMP_EPS
      ) {
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
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const scrollMargin =
      scrollMarginRef.current !== 0
        ? scrollMarginRef.current
        : readScrollMargin(document.getElementById(entries[0].id));
    for (let i = 0; i < entries.length; i++) {
      const el = resolveEntryEl(entries[i].id);
      if (!el) {
        continue;
      }
      if (
        snapPointFor(entryTop(el, container), scrollMargin, maxScrollTop) >
        scrollTop + JUMP_EPS
      ) {
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

  /** Only a response at the tail of a live submission is actually generating.
   *  Every other entry with no preview is a settled message whose content
   *  simply has no text part — including the user's own turn, which is what
   *  sits last for the frames between sending and the reply's row mounting. */
  const lastEntry = messageEntries[messageEntries.length - 1];
  const pendingId = isSubmitting && !lastEntry.isUser ? lastEntry.id : null;

  const labelFor = (entry: MessageEntry): string => {
    if (entry.isStart === true) {
      return localize('com_ui_scroll_to_top');
    }
    if (entry.isEnd === true) {
      return localize('com_ui_scroll_to_bottom');
    }
    return localize(
      entry.isUser ? 'com_ui_message_nav_go_to_user' : 'com_ui_message_nav_go_to_assistant',
      { 0: previewTextFor(entry, localize, entry.id === pendingId).slice(0, 30) },
    );
  };

  const previewFor = (entry: MessageEntry): string =>
    previewTextFor(entry, localize, entry.id === pendingId);

  return (
    <Rail
      navRef={navRef}
      ariaLabel={localize('com_ui_message_nav')}
      keyShortcuts="Shift+Alt+M"
      entries={messageEntries}
      startEntry={startEntry}
      endEntry={endEntry}
      currentId={currentId}
      visibleIds={visibleIds}
      railWindow={railWindow}
      canGoUp={canGoUp}
      canGoDown={canGoDown}
      previousLabel={localize('com_ui_message_nav_previous')}
      nextLabel={localize('com_ui_message_nav_next')}
      onPrevious={jumpToPrevious}
      onNext={jumpToNext}
      onSelect={handleSelect}
      onScrub={scrollToImmediate}
      labelFor={labelFor}
      previewFor={previewFor}
    />
  );
}

export default memo(MessageNav);
