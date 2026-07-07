import { memo, useEffect, useMemo, useState } from 'react';
import { CornerDownLeft, X } from 'lucide-react';
import { atom, useRecoilState } from 'recoil';
import { useResumeSubmit } from '../Messages/Content/ApprovalContext';
import { findLiveAskUserQuestion } from '~/utils/approval';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Action ids the user closed the popover for — session-scoped; the inline
 *  question card in the transcript remains the fallback answer surface. Recoil
 *  so ChatForm (placeholder + submit routing) reacts to a dismissal too. */
const dismissedAskActionsAtom = atom<string[]>({
  key: 'askUserQuestionDismissedActions',
  default: [],
});

/**
 * Shared derivation for the composer's ask-question integration: the live
 * (unanswered, undismissed) question for a conversation. Used by both the
 * popover and ChatForm (placeholder override + answer-routing submit).
 */
export function useLiveAskUserQuestion(conversationId?: string | null) {
  const enabled = conversationId != null && conversationId !== 'new';
  const { data: messagesTree } = useGetMessagesByConvoId(enabled ? conversationId : '', {
    enabled,
  });
  const liveAsk = useMemo(
    () => (enabled ? findLiveAskUserQuestion(messagesTree) : null),
    [enabled, messagesTree],
  );
  const [dismissedIds, setDismissedIds] = useRecoilState(dismissedAskActionsAtom);
  const dismissed = liveAsk != null && dismissedIds.includes(liveAsk.actionId);
  const dismiss = () => {
    if (liveAsk && !dismissedIds.includes(liveAsk.actionId)) {
      setDismissedIds((prev) => [...prev, liveAsk.actionId]);
    }
  };
  return { liveAsk, dismissed, dismiss };
}

/**
 * Composer popover for a live `ask_user_question` pause, matching the
 * mentions/prompts popovers: the question as a header, numbered option rows
 * (↑/↓ + Enter from the composer while it's empty), and the main textarea as
 * the free-form answer ("Something else…"). Renders exactly while the pause's
 * synthetic content part exists and disappears the moment an answer submits.
 */
function AskUserQuestionPopoverContent({
  conversationId,
  textAreaRef,
}: {
  conversationId: string;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const localize = useLocalize();
  const { liveAsk, dismissed, dismiss } = useLiveAskUserQuestion(conversationId);
  const { submitAskAnswer } = useResumeSubmit();
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => liveAsk?.question.options ?? [], [liveAsk]);

  useEffect(() => setActiveIndex(0), [liveAsk?.actionId]);

  useEffect(() => {
    if (!liveAsk || dismissed || options.length === 0) {
      return;
    }
    const textarea = textAreaRef.current;
    if (!textarea) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Only steer the option list while the composer is empty — otherwise the
      // keys belong to the text the user is typing as a free-form answer.
      if (textarea.value.trim().length > 0) {
        return;
      }
      // Number keys pick the matching option directly (1-9), mirroring the
      // row chips — same empty-composer guard as the arrow keys.
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(options.length, 9)) {
        e.preventDefault();
        e.stopPropagation();
        submitAskAnswer(liveAsk.actionId, options[digit - 1].value);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const option = options[activeIndex];
        if (option) {
          submitAskAnswer(liveAsk.actionId, option.value);
        }
      } else if (e.key === 'Escape') {
        dismiss();
      }
    };
    textarea.addEventListener('keydown', onKeyDown, { capture: true });
    return () => textarea.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [liveAsk, dismissed, options, activeIndex, submitAskAnswer, textAreaRef, dismiss]);

  if (!liveAsk || dismissed) {
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
            onClick={() => submitAskAnswer(liveAsk.actionId, option.value)}
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
  textAreaRef,
}: {
  conversationId?: string | null;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  if (conversationId == null || conversationId === 'new') {
    return null;
  }
  return (
    <AskUserQuestionPopoverContent conversationId={conversationId} textAreaRef={textAreaRef} />
  );
});

export default AskUserQuestionPopover;
