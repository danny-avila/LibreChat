import { memo, useEffect, useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from '@librechat/client';
import { Check, ChevronDown, CornerDownLeft, TriangleAlert, X } from 'lucide-react';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import { useChatFormContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Composer popover for a live `ask_user_question` pause. Single-select rows
 * submit on click; a digit `1..N` activates its row like a click whether
 * focus is in the composer or on the popover (arrows/Enter highlight+confirm
 * from the empty composer); multi-select rows toggle checks and an explicit
 * Submit confirms —
 * folding in any free-form text typed in the composer, exactly like Enter
 * would. The footer hint is a button that focuses the composer — the
 * free-form answer box. Collapse (chevron) hides the popover but keeps
 * answer mode live via the chat card; × dismisses it entirely. Pure
 * rendering off {@link useAskAnswerMode}; disappears the moment an answer
 * submits from any surface, and locks while one is in flight.
 */
function AskUserQuestionPopoverContent({
  conversationId,
  textAreaRef,
}: {
  conversationId: string;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  const ask = useAskAnswerMode(conversationId);

  if (!ask.popoverVisible || !ask.liveAsk) {
    return null;
  }

  return <AskUserQuestionPopoverPanel ask={ask} textAreaRef={textAreaRef} />;
}

/**
 * Split from the gate above so the per-keystroke `useWatch` subscription only
 * exists while the popover is actually visible — the invisible popover was
 * re-rendering (to null) on every composer keystroke.
 */
function AskUserQuestionPopoverPanel({
  ask,
  textAreaRef,
}: {
  ask: ReturnType<typeof useAskAnswerMode>;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  const localize = useLocalize();
  const { control } = useChatFormContext();
  /** Reactive composer text so multi-select Submit can include (and enable
   *  on) the free-form answer the footer hint invites. */
  const composerText = (useWatch({ control, name: 'text' }) ?? '') as string;
  const {
    liveAsk,
    options,
    selected,
    checked,
    multiSelect,
    locked,
    errored,
    toggleChecked,
    canSubmit,
    submit,
    submitOption,
    skip,
    dismiss,
    collapse,
    handlePopoverKeyDown,
  } = ask;

  /** Keyboard selection only paints a highlight (no focus move), so the
   *  scrollable option list has to follow `selected` itself or arrow/digit
   *  navigation can land on a row that is scrolled out of view. Manual
   *  scrollTop math rather than scrollIntoView: it cannot disturb the page. */
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (typeof selected !== 'number') {
      return;
    }
    const list = listRef.current;
    const row = optionRefs.current[selected];
    if (list == null || row == null) {
      return;
    }
    const rowBottom = row.offsetTop + row.offsetHeight;
    if (row.offsetTop < list.scrollTop) {
      list.scrollTop = row.offsetTop;
    } else if (rowBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = rowBottom - list.clientHeight;
    }
  }, [selected]);

  if (!liveAsk) {
    return null;
  }

  const composerHasText = composerText.trim().length > 0;

  return (
    <div className="absolute bottom-28 z-10 w-full space-y-2">
      {/* Digit shortcuts (1..N) work when focus is inside the popover too, not
          only from the composer — keydown bubbles here from the focused row/
          control. Height is viewport-bounded with the option list as the only
          scroll region: the panel is absolutely positioned, so anything that
          overflows it is unreachable by page scroll. */}
      <div
        className="popover border-token-border-light flex max-h-[60vh] flex-col rounded-2xl border bg-white p-2 shadow-lg dark:bg-gray-700"
        onKeyDown={handlePopoverKeyDown}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 p-2">
          <div className="max-h-[24vh] min-w-0 overflow-y-auto">
            <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
              {liveAsk.question.question}
            </p>
            {liveAsk.question.description != null && liveAsk.question.description.length > 0 && (
              <p className="mt-0.5 text-xs text-text-secondary [overflow-wrap:anywhere]">
                {liveAsk.question.description}
              </p>
            )}
          </div>
          <div className="flex items-center">
            <button
              type="button"
              aria-label={localize('com_ui_collapse')}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover"
              onClick={collapse}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={localize('com_ui_close')}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover"
              onClick={dismiss}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {options.map((option, index) => {
            const isChecked = multiSelect && checked.includes(index);
            return (
              <button
                key={option.value}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role={multiSelect ? 'checkbox' : undefined}
                aria-checked={multiSelect ? isChecked : undefined}
                disabled={locked}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm text-text-primary',
                  selected === index ? 'bg-surface-active' : 'hover:bg-surface-hover',
                  locked ? 'cursor-not-allowed opacity-60' : '',
                )}
                onClick={() => (multiSelect ? toggleChecked(index) : submitOption(index))}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs',
                    isChecked
                      ? 'bg-surface-submit text-white'
                      : 'bg-surface-tertiary text-text-secondary',
                  )}
                >
                  {isChecked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
              </button>
            );
          })}
        </div>
        {/** A failed submission keeps the question answerable (controls stay
         *   enabled), but the chat card that would show the error is hidden
         *   while the popover is up — so surface it here for retry guidance. */}
        {errored && (
          <div className="flex shrink-0 items-center gap-1.5 px-2 pt-1 text-xs text-text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {localize('com_ui_ask_answer_error')}
          </div>
        )}
        <div className="flex shrink-0 items-center justify-between gap-2 p-2">
          <button
            type="button"
            className="text-xs italic text-text-secondary hover:text-text-primary hover:underline"
            onClick={() => textAreaRef?.current?.focus()}
          >
            {options.length === 0
              ? localize('com_ui_ask_type_below_only')
              : localize('com_ui_ask_type_below')}
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={locked} onClick={() => skip()}>
              {localize('com_ui_skip')}
            </Button>
            {multiSelect && options.length > 0 && (
              <Button
                size="sm"
                variant="submit"
                disabled={locked || (!canSubmit && !composerHasText)}
                onClick={() => submit(composerText)}
              >
                {localize('com_ui_submit')}
                <CornerDownLeft className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const AskUserQuestionPopover = memo(function AskUserQuestionPopover({
  conversationId,
  textAreaRef,
}: {
  conversationId?: string | null;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
}) {
  if (conversationId == null || conversationId === 'new') {
    return null;
  }
  return (
    <AskUserQuestionPopoverContent conversationId={conversationId} textAreaRef={textAreaRef} />
  );
});

export default AskUserQuestionPopover;
