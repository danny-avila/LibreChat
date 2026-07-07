import { memo } from 'react';
import { Button } from '@librechat/client';
import { CornerDownLeft, X } from 'lucide-react';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Composer popover for a live `ask_user_question` pause. Select-then-confirm:
 * rows highlight on click (or arrows/digits from the empty composer), the last
 * row is an inline free-form input, and Submit (or Enter) fires the answer.
 * Skip dismisses. Pure rendering off {@link useAskAnswerMode}; disappears the
 * moment an answer submits from any surface.
 */
function AskUserQuestionPopoverContent({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const { liveAsk, active, options, selected, setSelected, canSubmit, submit, skip, dismiss } =
    useAskAnswerMode(conversationId);

  if (!active || !liveAsk) {
    return null;
  }

  return (
    <div className="absolute bottom-28 z-10 w-full space-y-2">
      <div className="popover border-token-border-light rounded-2xl border bg-white p-2 shadow-lg dark:bg-gray-700">
        <div className="flex items-start justify-between gap-2 p-2">
          <div>
            <p className="text-sm font-medium text-text-primary">{liveAsk.question.question}</p>
            {liveAsk.question.description != null && liveAsk.question.description.length > 0 && (
              <p className="mt-0.5 text-xs text-text-secondary">{liveAsk.question.description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={localize('com_ui_close')}
            className="rounded p-1 text-text-secondary hover:bg-surface-hover"
            onClick={dismiss}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm text-text-primary',
              selected === index ? 'bg-surface-active' : 'hover:bg-surface-hover',
            )}
            onClick={() => setSelected(index)}
            onDoubleClick={() => {
              setSelected(index);
              submit();
            }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-tertiary text-xs text-text-secondary">
              {index + 1}
            </span>
            <span className="flex-1">{option.label}</span>
          </button>
        ))}
        <div className="flex items-center justify-end gap-2 p-2">
          <Button size="sm" variant="outline" onClick={() => skip()}>
            {localize('com_ui_skip')}
          </Button>
          <Button size="sm" variant="submit" disabled={!canSubmit} onClick={() => submit()}>
            {localize('com_ui_submit')}
            <CornerDownLeft className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const AskUserQuestionPopover = memo(function AskUserQuestionPopover({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  if (conversationId == null || conversationId === 'new') {
    return null;
  }
  return <AskUserQuestionPopoverContent conversationId={conversationId} />;
});

export default AskUserQuestionPopover;
