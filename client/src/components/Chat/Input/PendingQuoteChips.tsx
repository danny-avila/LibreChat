import { memo, useRef, useState, useEffect, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { TextQuote, X } from 'lucide-react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';

const CHIP_CLASS =
  'inline-flex max-w-full items-center gap-1 rounded-2xl border border-border-light bg-surface-secondary px-2.5 py-1.5 text-sm text-text-secondary';
const REMOVE_BTN_CLASS =
  '-mr-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
const TRIGGER_CLASS =
  'inline-flex min-w-0 items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy';
/** Grace period so moving the pointer between the chip and the popup doesn't close it. */
const CLOSE_DELAY_MS = 120;

/**
 * Chip row rendered above the textarea for excerpts the user quoted via the
 * "Add to chat" selection popup. Shows a single chip: the excerpt text for one
 * selection, or a collapsed "{n} selections" pill for multiple — so the
 * composer never fills with a row of chips.
 *
 * The collapsed pill is an Ariakit `Popover` disclosure: it opens on
 * click / Enter / Space (keyboard users tab through the excerpts, Escape closes
 * and Ariakit restores focus to the trigger) and on hover for mouse users.
 * `autoFocusOnShow` is disabled so opening never pulls focus off the composer;
 * `autoFocusOnHide` still returns focus to the trigger when focus was inside.
 *
 * Reads + writes `pendingQuotesByConvoId` directly; the atom is drained in
 * `useChatFunctions.ask` on submit, so chips disappear once the message is sent
 * (the excerpts then re-render as `MessageQuotes` on the user bubble).
 */
function PendingQuoteChips({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const quotes = useRecoilValue(store.pendingQuotesByConvoId(conversationId));
  const setQuotes = useSetRecoilState(store.pendingQuotesByConvoId(conversationId));

  const popover = Ariakit.usePopoverStore({ placement: 'top-start' });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Ariakit only restores focus to the trigger on hide when it took focus on
   * show, so keep `autoFocusOnShow` on for keyboard/click opens (Escape returns
   * focus to the trigger) and off for hover so it never pulls focus off the
   * composer mid-typing.
   */
  const [focusOnShow, setFocusOnShow] = useState(true);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const openByPointer = useCallback(() => {
    cancelClose();
    setFocusOnShow(false);
    popover.show();
  }, [cancelClose, popover]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => popover.hide(), CLOSE_DELAY_MS);
  }, [cancelClose, popover]);

  useEffect(() => cancelClose, [cancelClose]);

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
        <>
          <span
            role="listitem"
            className={CHIP_CLASS}
            onPointerEnter={openByPointer}
            onPointerLeave={scheduleClose}
          >
            <Ariakit.PopoverDisclosure
              store={popover}
              className={TRIGGER_CLASS}
              aria-label={localize('com_ui_quote_selections', { 0: quotes.length })}
              onClick={() => setFocusOnShow(true)}
            >
              <TextQuote className="h-4 w-4 shrink-0 text-cyan-500" aria-hidden="true" />
              <span className="truncate">
                {localize('com_ui_quote_selections', { 0: quotes.length })}
              </span>
            </Ariakit.PopoverDisclosure>
            <button
              type="button"
              aria-label={localize('com_ui_remove_all_quotes')}
              onClick={clearAll}
              className={REMOVE_BTN_CLASS}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
          <Ariakit.Popover
            store={popover}
            portal
            gutter={8}
            autoFocusOnShow={focusOnShow}
            data-testid="quote-selections-popup"
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            className="z-50 w-80 max-w-[90vw] rounded-xl border border-border-light bg-surface-secondary p-2 text-text-primary shadow-lg outline-none"
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
                    className="mt-0.5 shrink-0 rounded-full p-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </Ariakit.Popover>
        </>
      )}
    </div>
  );
}

export default memo(PendingQuoteChips);
