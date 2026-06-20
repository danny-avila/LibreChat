import { memo, useCallback } from 'react';
import { TextQuote, X } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Chip row rendered above the textarea showing excerpts the user quoted via
 * the "Add to chat" selection popup for the next submission. Each chip has an
 * × to remove that excerpt before sending.
 *
 * Reads + writes `pendingQuotesByConvoId` directly. The atom is drained in
 * `useChatFunctions.ask` on submit, so chips disappear once the message is
 * sent (the excerpts then re-render as `MessageQuotes` on the user bubble).
 */
function PendingQuoteChips({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const quotes = useRecoilValue(store.pendingQuotesByConvoId(conversationId));
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  const remove = useCallback(
    (text: string) => {
      setQuotes((prev) => prev.filter((quote) => quote !== text));
    },
    [setQuotes],
  );

  if (quotes.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 px-2 pt-2"
      role="list"
      aria-label={localize('com_ui_quotes_queued')}
    >
      {quotes.map((text) => (
        <span
          key={text}
          role="listitem"
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary"
        >
          <TextQuote className="h-3 w-3 shrink-0 text-cyan-500" aria-hidden="true" />
          <span className="max-w-[12rem] truncate" title={text}>
            {text}
          </span>
          <button
            type="button"
            aria-label={localize('com_ui_remove_quote')}
            onClick={() => remove(text)}
            className="-mr-0.5 ml-0.5 rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default memo(PendingQuoteChips);
