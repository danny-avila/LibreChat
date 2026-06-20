import { memo, useCallback, useEffect, useState } from 'react';
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
/** Vertical gap (px) between the selection and the popup. */
const POPUP_OFFSET = 8;
/** Keep the popup this far (px) from the viewport's left/right edges. */
const EDGE_MARGIN = 16;

type SelectionState = {
  text: string;
  top: number;
  left: number;
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
    top: Math.max(rect.top - POPUP_OFFSET, POPUP_OFFSET),
    left: Math.min(
      Math.max(rect.left + rect.width / 2, EDGE_MARGIN),
      window.innerWidth - EDGE_MARGIN,
    ),
  };
};

/**
 * ChatGPT-style floating "Add to chat" button. Watches for text selections
 * inside chat messages and, on click, appends the selected excerpt to the
 * conversation's pending-quotes queue so it shows as a removable chip above
 * the composer and rides along with the next submission.
 *
 * Rendered through a portal so the `fixed` positioning stays viewport-relative
 * regardless of any transformed ancestor in the composer tree.
 */
function QuoteButton({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  useEffect(() => {
    const updateSelection = () => setSelection(readSelection());
    const clearSelection = () => setSelection(null);

    document.addEventListener('mouseup', updateSelection);
    document.addEventListener('keyup', updateSelection);
    document.addEventListener('scroll', clearSelection, true);
    window.addEventListener('resize', clearSelection);

    return () => {
      document.removeEventListener('mouseup', updateSelection);
      document.removeEventListener('keyup', updateSelection);
      document.removeEventListener('scroll', clearSelection, true);
      window.removeEventListener('resize', clearSelection);
    };
  }, []);

  const addQuote = useCallback(() => {
    if (!selection) {
      return;
    }
    setQuotes((prev) => (prev.includes(selection.text) ? prev : [...prev, selection.text]));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    document.getElementById(mainTextareaId)?.focus();
  }, [selection, setQuotes]);

  if (!selection) {
    return null;
  }

  return createPortal(
    <button
      type="button"
      /** Keep the selection alive while the click lands. */
      onMouseDown={(e) => e.preventDefault()}
      onClick={addQuote}
      aria-label={localize('com_ui_add_to_chat')}
      data-testid="add-to-chat-button"
      style={{
        top: selection.top,
        left: selection.left,
        transform: 'translate(-50%, -100%)',
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
