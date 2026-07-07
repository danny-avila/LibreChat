import { useCallback, useMemo } from 'react';
import { atom, useRecoilState } from 'recoil';
import { useResumeSubmit } from '~/components/Chat/Messages/Content/ApprovalContext';
import { findLiveAskUserQuestion } from '~/utils/approval';
import { useGetMessagesByConvoId } from '~/data-provider';

/** Dismissed action ids — recoil so every consumer (popover, composer) reacts. */
const dismissedAskActionsAtom = atom<string[]>({
  key: 'askAnswerModeDismissedActions',
  default: [],
});

/** Highlighted option row, shared between the popover (render) and the
 *  composer's key handling (navigation). */
const askAnswerActiveIndexAtom = atom<number>({
  key: 'askAnswerModeActiveIndex',
  default: 0,
});

/**
 * First-class "answer mode" for the composer. While an `ask_user_question`
 * pause is live (its synthetic content part exists and the user hasn't
 * dismissed the popover), the composer answers the question instead of
 * starting a new turn:
 *
 *   - `handleKeyDown` owns option navigation from the EMPTY composer
 *     (arrows, 1-9 direct pick, Enter selects, Escape dismisses) and returns
 *     whether it consumed the event — the caller runs its normal key handling
 *     only when it didn't;
 *   - `submitText` routes non-empty composer text to the paused run as the
 *     free-form answer and reports whether it consumed the submission;
 *   - `active` drives the placeholder swap ("Something else…").
 *
 * Deliberately scoped to the composer (not `useSubmitMessage`): other submit
 * surfaces (conversation starters, prompt commands) send canned prompts whose
 * meaning is "new turn", so they keep normal semantics — which also means
 * they inherit the existing job-replacement behavior while paused.
 */
export default function useAskAnswerMode(conversationId?: string | null) {
  const enabled = conversationId != null && conversationId !== 'new';
  const { data: messages } = useGetMessagesByConvoId(enabled ? conversationId : '', {
    enabled,
  });
  const liveAsk = useMemo(
    () => (enabled ? findLiveAskUserQuestion(messages) : null),
    [enabled, messages],
  );
  const [dismissedIds, setDismissedIds] = useRecoilState(dismissedAskActionsAtom);
  const [activeIndex, setActiveIndex] = useRecoilState(askAnswerActiveIndexAtom);
  const { submitAskAnswer } = useResumeSubmit();

  const dismissed = liveAsk != null && dismissedIds.includes(liveAsk.actionId);
  const active = liveAsk != null && !dismissed;
  const options = useMemo(() => liveAsk?.question.options ?? [], [liveAsk]);

  const dismiss = useCallback(() => {
    if (liveAsk) {
      setDismissedIds((prev) =>
        prev.includes(liveAsk.actionId) ? prev : [...prev, liveAsk.actionId],
      );
    }
  }, [liveAsk, setDismissedIds]);

  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (liveAsk && option) {
        submitAskAnswer(liveAsk.actionId, option.value);
      }
    },
    [liveAsk, options, submitAskAnswer],
  );

  /** Non-empty composer text answers the question; returns true when consumed. */
  const submitText = useCallback(
    (text: string): boolean => {
      if (!active || !liveAsk) {
        return false;
      }
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        submitAskAnswer(liveAsk.actionId, trimmed);
      }
      return true;
    },
    [active, liveAsk, submitAskAnswer],
  );

  /** Option navigation from the composer; returns true when it consumed the key. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active || options.length === 0) {
        return false;
      }
      // Keys belong to the user's text once they start typing a free-form answer.
      if (e.currentTarget.value.trim().length > 0) {
        return false;
      }
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(options.length, 9)) {
        e.preventDefault();
        selectOption(digit - 1);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % options.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
        return true;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectOption(activeIndex);
        return true;
      }
      if (e.key === 'Escape') {
        dismiss();
        return true;
      }
      return false;
    },
    [active, options, activeIndex, selectOption, setActiveIndex, dismiss],
  );

  return {
    active,
    liveAsk,
    options,
    dismissed,
    dismiss,
    activeIndex,
    setActiveIndex,
    selectOption,
    submitText,
    handleKeyDown,
  };
}
