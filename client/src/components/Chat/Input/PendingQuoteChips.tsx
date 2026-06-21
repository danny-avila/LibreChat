import { memo, useCallback } from 'react';
import { TextQuote, X } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { HoverCard, HoverCardPortal, HoverCardContent, HoverCardTrigger } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const CHIP_CLASS =
  'inline-flex max-w-full items-center gap-1.5 rounded-2xl border border-border-light bg-surface-secondary px-2.5 py-1.5 text-sm text-text-secondary';
const REMOVE_BTN_CLASS =
  '-mr-0.5 ml-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary';

/**
 * Chip row rendered above the textarea for excerpts the user quoted via the
 * "Add to chat" selection popup. Shows a single chip: the excerpt text for one
 * selection, or a collapsed "{n} selections" pill (with a hover popup listing
 * each excerpt) for multiple — so the composer never fills with a row of chips.
 *
 * Reads + writes `pendingQuotesByConvoId` directly; the atom is drained in
 * `useChatFunctions.ask` on submit, so chips disappear once the message is sent
 * (the excerpts then re-render as `MessageQuotes` on the user bubble).
 */
function PendingQuoteChips({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const quotes = useRecoilValue(store.pendingQuotesByConvoId(conversationId));
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  const clearAll = useCallback(() => setQuotes([]), [setQuotes]);
  const removeAt = useCallback(
    (index: number) => setQuotes((prev) => prev.filter((_, i) => i !== index)),
    [setQuotes],
  );

  if (quotes.length === 0) {
    return null;
  }

  const isMulti = quotes.length > 1;

  return (
    <div
      className="flex flex-wrap gap-1.5 px-2 pt-2"
      role="list"
      aria-label={localize('com_ui_quotes_queued')}
      data-testid="pending-quote-chips"
      data-quote-count={quotes.length}
    >
      {!isMulti ? (
        <span role="listitem" className={CHIP_CLASS}>
          <TextQuote className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
          <span className="max-w-[16rem] truncate" title={quotes[0]}>
            {quotes[0]}
          </span>
          <button
            type="button"
            aria-label={localize('com_ui_remove_quote')}
            onClick={clearAll}
            className={REMOVE_BTN_CLASS}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <HoverCard openDelay={80} closeDelay={120}>
          <HoverCardTrigger asChild>
            <span role="listitem" className={cn(CHIP_CLASS, 'cursor-default')}>
              <TextQuote className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
              <span>{localize('com_ui_quote_selections', { 0: quotes.length })}</span>
              <button
                type="button"
                aria-label={localize('com_ui_remove_all_quotes')}
                onClick={clearAll}
                className={REMOVE_BTN_CLASS}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          </HoverCardTrigger>
          <HoverCardPortal>
            <HoverCardContent
              side="top"
              align="start"
              className="w-80 max-w-[90vw] p-2"
              data-testid="quote-selections-popup"
            >
              <ul className="flex flex-col gap-1" aria-label={localize('com_ui_referenced_quotes')}>
                {quotes.map((text, index) => (
                  <li
                    key={`${index}-${text.slice(0, 24)}`}
                    className="flex items-start gap-1.5 rounded-xl px-1.5 py-1 hover:bg-surface-tertiary"
                  >
                    <TextQuote
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary"
                      aria-hidden="true"
                    />
                    <span className="line-clamp-2 flex-1 whitespace-pre-wrap break-words text-sm text-text-secondary">
                      {text}
                    </span>
                    <button
                      type="button"
                      aria-label={localize('com_ui_remove_quote')}
                      onClick={() => removeAt(index)}
                      className="mt-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </HoverCardContent>
          </HoverCardPortal>
        </HoverCard>
      )}
    </div>
  );
}

export default memo(PendingQuoteChips);
