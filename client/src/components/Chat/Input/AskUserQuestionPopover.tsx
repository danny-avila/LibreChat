import { memo } from 'react';
import { CornerDownLeft, X } from 'lucide-react';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/**
 * Composer popover for a live `ask_user_question` pause, matching the
 * mentions/prompts popovers. Pure rendering: all state (live question,
 * dismissal, option highlight, selection) lives in {@link useAskAnswerMode},
 * which the composer shares for placeholder/keyboard/submit routing. Renders
 * exactly while the pause's synthetic content part exists and disappears the
 * moment an answer submits from any surface.
 */
function AskUserQuestionPopoverContent({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const { liveAsk, active, options, activeIndex, setActiveIndex, selectOption, dismiss } =
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
              index === activeIndex ? 'bg-surface-active' : 'hover:bg-surface-hover',
            )}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectOption(index)}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-tertiary text-xs text-text-secondary">
              {index + 1}
            </span>
            <span className="flex-1">{option.label}</span>
            {index === activeIndex && (
              <CornerDownLeft className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            )}
          </button>
        ))}
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
