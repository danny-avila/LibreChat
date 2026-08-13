import { memo, useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { TextQuote } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { mainTextareaId } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

/** Only selections fully inside a rendered chat message get the popup. */
const MESSAGE_SELECTOR = '.message-render';
/** Max characters captured per excerpt (backend re-caps as defense-in-depth). */
const MAX_QUOTE_LENGTH = 1500;
/** Max excerpts queued at once; mirrors the backend `QUOTE_MAX_COUNT` cap so
 *  the composer never shows more quotes than the model actually receives. */
const MAX_QUOTE_COUNT = 10;
/** Vertical gap (px) between the selection and the popup. */
const POPUP_OFFSET = 8;
/** Keep the popup this far (px) from the viewport edges. */
const EDGE_MARGIN = 16;
/** Quiet period before a mouse-less selection (touch long-press, native handle
 *  drag, keyboard extend) is treated as final. Every change restarts it, so the
 *  popup lands once the selection stops moving instead of chasing a handle. */
const SELECTION_SETTLE_MS = 300;

type Anchor = {
  /** Viewport-relative bounds of the selection (used to place the button). */
  top: number;
  bottom: number;
  centerX: number;
};

type SelectionState = {
  text: string;
  anchor: Anchor;
  /** Touch selections carry an OS callout above them, so the popup goes below. */
  viaTouch: boolean;
};

type Reading = {
  text: string;
  anchor: Anchor;
  /** Retained so scrolling can re-measure without re-walking the selection. */
  range: Range;
};

const resolveMessageElement = (node: Node | null): HTMLElement | null => {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return (element?.closest(MESSAGE_SELECTOR) as HTMLElement | null) ?? null;
};

const anchorFromRect = (rect: DOMRect): Anchor | null => {
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  return { top: rect.top, bottom: rect.bottom, centerX: rect.left + rect.width / 2 };
};

const sameAnchor = (a: Anchor, b: Anchor): boolean =>
  a.top === b.top && a.bottom === b.bottom && a.centerX === b.centerX;

const stripWhitespace = (value: string): string => value.replace(/\s+/g, '');

/**
 * Block-granularity gestures (triple-click, double-click then drag) park the
 * selection's far boundary at the start of the *next* block. For the last block
 * of a message that boundary sits outside `.message-render` — on the composer
 * wrapper or the following message — even though no text out there is selected,
 * which used to suppress the popup for any triple-clicked closing paragraph.
 *
 * Clamping the range to the message keeps those gestures eligible; comparing
 * visible text (whitespace-insensitive, since the overhang contributes only
 * collapsed whitespace) still rejects selections that truly span messages.
 */
const clampToMessage = (range: Range, message: HTMLElement): Range | null => {
  const bounds = document.createRange();
  bounds.selectNodeContents(message);

  const clamped = range.cloneRange();
  if (clamped.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) {
    clamped.setStart(bounds.startContainer, bounds.startOffset);
  }
  if (clamped.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) {
    clamped.setEnd(bounds.endContainer, bounds.endOffset);
  }

  return stripWhitespace(clamped.toString()) === stripWhitespace(range.toString()) ? clamped : null;
};

const readSelection = (): Reading | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startMessage = resolveMessageElement(range.startContainer);
  const endMessage = resolveMessageElement(range.endContainer);
  const message = startMessage ?? endMessage;
  if (!message) {
    return null;
  }

  let measured = range;
  if (startMessage !== endMessage) {
    const clamped = clampToMessage(range, message);
    if (!clamped) {
      return null;
    }
    measured = clamped;
  }

  /** `Selection.toString()` reflects rendered text, so it stays the quote source
   *  even when the measured range was clamped to the message. */
  const text = selection
    .toString()
    .replace(/\u00a0/g, ' ')
    .trim();
  if (text.length === 0) {
    return null;
  }

  const anchor = anchorFromRect(measured.getBoundingClientRect());
  if (!anchor) {
    return null;
  }

  return { text: text.slice(0, MAX_QUOTE_LENGTH), anchor, range: measured };
};

/** Place the popup on the preferred side, falling back to the other side and
 *  finally clamping into the viewport. */
const resolveTop = (anchor: Anchor, height: number, preferBelow: boolean): number => {
  const above = anchor.top - POPUP_OFFSET - height;
  const below = anchor.bottom + POPUP_OFFSET;
  const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  const fits = (value: number) => value >= EDGE_MARGIN && value <= maxTop;

  const [preferred, fallback] = preferBelow ? [below, above] : [above, below];
  if (fits(preferred)) {
    return preferred;
  }
  if (fits(fallback)) {
    return fallback;
  }
  return Math.min(Math.max(preferred, EDGE_MARGIN), maxTop);
};

/**
 * ChatGPT-style floating "Add to chat" button. Watches for text selections
 * inside chat messages and, on click, appends the selected excerpt to the
 * conversation's pending-quotes queue so it shows as a removable chip above
 * the composer and rides along with the next submission.
 *
 * Pointer and touch platforms surface selections through different events:
 * a mouse drag ends in `mouseup`, but a long-press or a drag of the native
 * selection handles emits no mouse event at all, only `selectionchange`. Both
 * are handled — mouse paths show immediately, mouse-less ones after the
 * selection settles — so the popup is reachable on phones as well as desktops.
 *
 * Rendered through a portal so the `fixed` positioning stays viewport-relative
 * regardless of any transformed ancestor in the composer tree. The on-screen
 * position is computed from the button's measured size (no CSS transform), so it
 * is clamped accurately to the viewport, and it tracks the selection while the
 * page scrolls rather than dismissing on the first scroll event.
 */
function QuoteButton({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<Range | null>(null);
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    /** Suppresses showing mid-drag, which would flicker the popup across the
     *  growing selection; the closing `mouseup` shows it. */
    let mouseDragging = false;
    let viaTouch = false;

    const clearSettleTimer = () => {
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
        settleTimer = undefined;
      }
    };

    const hide = () => {
      clearSettleTimer();
      rangeRef.current = null;
      setSelection(null);
      setPos(null);
    };

    const show = (touch = viaTouch) => {
      clearSettleTimer();
      const reading = readSelection();
      if (!reading) {
        hide();
        return;
      }
      rangeRef.current = reading.range;
      /** Reuse the previous state object when nothing moved so a redundant
       *  settle pass costs no render. */
      setSelection((prev) =>
        prev &&
        prev.text === reading.text &&
        prev.viaTouch === touch &&
        sameAnchor(prev.anchor, reading.anchor)
          ? prev
          : { text: reading.text, anchor: reading.anchor, viaTouch: touch },
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      viaTouch = event.pointerType !== 'mouse';
      mouseDragging = !viaTouch;
    };

    const endPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        mouseDragging = false;
      }
    };

    const handleMouseUp = () => {
      mouseDragging = false;
      show();
    };

    /** Chromium commits a double-click word selection on `dblclick`, after
     *  `mouseup` has already read a still-collapsed range, so listen here too. */
    const handleDoubleClick = () => show();
    /** Keyboard selections carry no OS callout, so they never prefer below. */
    const handleKeyUp = () => show(false);

    /**
     * The only signal touch platforms give: long-press selection and native
     * handle drags fire no mouse events. Also hides the instant a selection
     * collapses or empties through paths that fire no input event — e.g. a
     * streaming markdown re-render replacing the selected text node, which
     * would otherwise strand the button over a now-collapsed caret.
     */
    const handleSelectionChange = () => {
      const current = window.getSelection();
      if (!current || current.rangeCount === 0 || current.isCollapsed) {
        hide();
        return;
      }
      if (mouseDragging) {
        return;
      }
      clearSettleTimer();
      const touch = viaTouch;
      settleTimer = setTimeout(() => show(touch), SELECTION_SETTLE_MS);
    };

    /** Follow the selection instead of dismissing on the first scroll: chat
     *  auto-scrolls while streaming, and on mobile the URL bar collapsing fires
     *  resize, both of which used to drop a selection the user just made. */
    const reanchor = () => {
      frame = 0;
      const range = rangeRef.current;
      if (!range) {
        return;
      }
      const anchor = anchorFromRect(range.getBoundingClientRect());
      if (!anchor || anchor.bottom < 0 || anchor.top > window.innerHeight) {
        hide();
        return;
      }
      setSelection((prev) =>
        prev && !sameAnchor(prev.anchor, anchor) ? { ...prev, anchor } : prev,
      );
    };

    const scheduleReanchor = () => {
      if (rangeRef.current === null || frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(reanchor);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', endPointer, true);
    document.addEventListener('pointercancel', endPointer, true);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('dblclick', handleDoubleClick);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('scroll', scheduleReanchor, true);
    window.addEventListener('resize', scheduleReanchor);

    return () => {
      clearSettleTimer();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      rangeRef.current = null;
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', endPointer, true);
      document.removeEventListener('pointercancel', endPointer, true);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('dblclick', handleDoubleClick);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('scroll', scheduleReanchor, true);
      window.removeEventListener('resize', scheduleReanchor);
    };
  }, []);

  /** Clamp using the button's real size so it never lands off-screen. Runs
   *  before paint, so the first visible frame is already in its final spot. */
  useLayoutEffect(() => {
    if (!selection || !buttonRef.current) {
      return;
    }
    const { width, height } = buttonRef.current.getBoundingClientRect();
    const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
    const left = Math.min(Math.max(selection.anchor.centerX - width / 2, EDGE_MARGIN), maxLeft);
    const top = resolveTop(selection.anchor, height, selection.viaTouch);

    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, [selection]);

  const addQuote = useCallback(() => {
    if (!selection) {
      return;
    }
    setQuotes((prev) =>
      prev.includes(selection.text) || prev.length >= MAX_QUOTE_COUNT
        ? prev
        : [...prev, selection.text],
    );
    rangeRef.current = null;
    setSelection(null);
    setPos(null);
    window.getSelection()?.removeAllRanges();
    document.getElementById(mainTextareaId)?.focus();
  }, [selection, setQuotes]);

  if (!selection) {
    return null;
  }

  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      /** A tap is also the gesture that dismisses a selection, which unmounts
       *  this button before `click` can land — so touch commits on the press
       *  itself, from state captured when the selection was read. */
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') {
          return;
        }
        event.preventDefault();
        addQuote();
      }}
      /** Keep the selection alive while a mouse click lands. */
      onMouseDown={(event) => event.preventDefault()}
      onClick={addQuote}
      aria-label={localize('com_ui_add_to_chat')}
      data-testid="add-to-chat-button"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        /** Hidden until measured so it never flashes at an unclamped position. */
        visibility: pos == null ? 'hidden' : 'visible',
      }}
      className={cn(
        'fixed z-50 inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface-secondary text-sm font-medium text-text-primary shadow-lg transition-colors hover:bg-surface-tertiary',
        /** Comfortable tap target when the selection came from a finger. */
        selection.viaTouch ? 'min-h-11 px-4 py-2.5' : 'px-3 py-1.5',
      )}
    >
      <TextQuote className="h-4 w-4" aria-hidden="true" />
      {localize('com_ui_add_to_chat')}
    </button>,
    document.body,
  );
}

export default memo(QuoteButton);
