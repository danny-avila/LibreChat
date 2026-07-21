import { memo, useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { TextQuote } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { mainTextareaId } from '~/common';
import { useLocalize } from '~/hooks';
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

type SelectionState = {
  text: string;
  /** Viewport-relative anchor of the selection (used to place the button). */
  top: number;
  bottom: number;
  centerX: number;
};

const resolveMessageElement = (node: Node | null): HTMLElement | null => {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return (element?.closest(MESSAGE_SELECTOR) as HTMLElement | null) ?? null;
};

const readSelection = (): SelectionState | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const anchorMessage = resolveMessageElement(selection.anchorNode);
  const focusMessage = resolveMessageElement(selection.focusNode);
  if (!anchorMessage || anchorMessage !== focusMessage) {
    return null;
  }

  const text = selection
    .toString()
    .replace(/\u00a0/g, ' ')
    .trim();
  if (text.length === 0) {
    return null;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return {
    text: text.slice(0, MAX_QUOTE_LENGTH),
    top: rect.top,
    bottom: rect.bottom,
    centerX: rect.left + rect.width / 2,
  };
};

/**
 * ChatGPT-style floating "Add to chat" button. Watches for text selections
 * inside chat messages and, on click, appends the selected excerpt to the
 * conversation's pending-quotes queue so it shows as a removable chip above
 * the composer and rides along with the next submission.
 *
 * Rendered through a portal so the `fixed` positioning stays viewport-relative
 * regardless of any transformed ancestor in the composer tree. The on-screen
 * position is computed from the button's measured size (no CSS transform), so it
 * is clamped accurately to the viewport — flipping below the selection when
 * there is no room above and keeping its full width within the side margins.
 */
function QuoteButton({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  useEffect(() => {
    const updateSelection = () => {
      setSelection(readSelection());
      /** Recompute placement from scratch for the new selection. */
      setPos(null);
    };
    const clearSelection = () => setSelection(null);
    /** Hide the popup the instant the selection collapses or empties, including
     *  paths that fire no mouse/key event — e.g. a streaming markdown re-render
     *  replacing the selected text node, which would otherwise leave the button
     *  stranded over a now-collapsed caret. Only hides here; showing stays gated
     *  on mouseup/dblclick/keyup so an in-progress drag never flickers it. */
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
      }
    };

    document.addEventListener('mouseup', updateSelection);
    /** Chromium commits a double-click word selection on `dblclick`, after
     *  `mouseup` has already read a still-collapsed range, so listen here too. */
    document.addEventListener('dblclick', updateSelection);
    document.addEventListener('keyup', updateSelection);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('scroll', clearSelection, true);
    window.addEventListener('resize', clearSelection);

    return () => {
      document.removeEventListener('mouseup', updateSelection);
      document.removeEventListener('dblclick', updateSelection);
      document.removeEventListener('keyup', updateSelection);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('scroll', clearSelection, true);
      window.removeEventListener('resize', clearSelection);
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
    const left = Math.min(Math.max(selection.centerX - width / 2, EDGE_MARGIN), maxLeft);

    const aboveTop = selection.top - POPUP_OFFSET - height;
    const belowTop = selection.bottom + POPUP_OFFSET;
    const maxTop = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
    const top = aboveTop >= EDGE_MARGIN ? aboveTop : Math.min(belowTop, maxTop);

    setPos({ top: Math.max(top, EDGE_MARGIN), left });
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
      /** Keep the selection alive while the click lands. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={addQuote}
      aria-label={localize('com_ui_add_to_chat')}
      data-testid="add-to-chat-button"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        /** Hidden until measured so it never flashes at an unclamped position. */
        visibility: pos == null ? 'hidden' : 'visible',
      }}
      className="fixed z-50 inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-primary shadow-lg transition-colors hover:bg-surface-tertiary"
    >
      <TextQuote className="h-4 w-4" aria-hidden="true" />
      {localize('com_ui_add_to_chat')}
    </button>,
    document.body,
  );
}

export default memo(QuoteButton);
