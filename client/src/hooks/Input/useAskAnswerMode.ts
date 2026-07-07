import { useCallback, useMemo } from 'react';
import { atom, useRecoilState } from 'recoil';
import { useResumeSubmit } from '~/components/Chat/Messages/Content/ApprovalContext';
import { findLiveAskUserQuestion, splitOtherOption } from '~/utils/approval';
import { useGetMessagesByConvoId } from '~/data-provider';

/** Dismissed action ids — recoil so every consumer reacts. */
const dismissedAskActionsAtom = atom<string[]>({
  key: 'askAnswerModeDismissedActions',
  default: [],
});

/** Current selection: an option index, the inline free-form row, or nothing. */
const askAnswerSelectionAtom = atom<number | 'other' | null>({
  key: 'askAnswerModeSelection',
  default: null,
});

/** Text typed into the popover's inline "Other" input. */
const askAnswerOtherTextAtom = atom<string>({
  key: 'askAnswerModeOtherText',
  default: '',
});

/**
 * First-class "answer mode" for a live `ask_user_question` pause, with
 * select-then-confirm semantics (borrowed from Claude Code's AskUserQuestion
 * UI): rows highlight on click/arrow/digit, free-form goes in the popover's
 * OWN inline input (the composer stays a normal composer — Stop keeps meaning
 * stop), and an explicit Submit (or Enter) fires the answer. `Skip` == dismiss.
 *
 * `handleComposerKeyDown` only steers selection from the EMPTY composer and
 * reports whether it consumed the key.
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
  const [selected, setSelected] = useRecoilState(askAnswerSelectionAtom);
  const [otherText, setOtherText] = useRecoilState(askAnswerOtherTextAtom);
  const { submitAskAnswer } = useResumeSubmit();

  const dismissed = liveAsk != null && dismissedIds.includes(liveAsk.actionId);
  const active = liveAsk != null && !dismissed;
  const { choices: options, otherLabel } = useMemo(
    () => splitOtherOption(liveAsk?.question.options),
    [liveAsk],
  );

  const dismiss = useCallback(() => {
    if (liveAsk) {
      setDismissedIds((prev) =>
        prev.includes(liveAsk.actionId) ? prev : [...prev, liveAsk.actionId],
      );
    }
  }, [liveAsk, setDismissedIds]);

  const canSubmit =
    active &&
    (typeof selected === 'number'
      ? options[selected] != null
      : selected === 'other' && otherText.trim().length > 0);

  /** Fires the confirmed selection; returns true when an answer was sent. */
  const submit = useCallback((): boolean => {
    if (!liveAsk || !canSubmit) {
      return false;
    }
    const answer = typeof selected === 'number' ? options[selected].value : otherText.trim();
    submitAskAnswer(liveAsk.actionId, answer);
    setSelected(null);
    setOtherText('');
    return true;
  }, [
    liveAsk,
    canSubmit,
    selected,
    options,
    otherText,
    submitAskAnswer,
    setSelected,
    setOtherText,
  ]);

  /** Selection steering from the empty composer; true when consumed. */
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active) {
        return false;
      }
      if (e.currentTarget.value.trim().length > 0) {
        return false;
      }
      const rowCount = options.length + 1; // + the inline Other row
      const asIndex = (value: number | 'other' | null): number =>
        value === 'other' ? options.length : (value ?? -1);
      const fromIndex = (index: number): number | 'other' =>
        index >= options.length ? 'other' : index;
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(rowCount, 9)) {
        e.preventDefault();
        setSelected(fromIndex(digit - 1));
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(fromIndex((asIndex(selected) + 1) % rowCount));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(fromIndex((asIndex(selected) - 1 + rowCount) % rowCount));
        return true;
      }
      if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
        e.preventDefault();
        submit();
        return true;
      }
      if (e.key === 'Escape') {
        dismiss();
        return true;
      }
      return false;
    },
    [active, options, selected, canSubmit, submit, dismiss, setSelected],
  );

  return {
    active,
    liveAsk,
    options,
    dismissed,
    dismiss,
    selected,
    setSelected,
    otherText,
    setOtherText,
    canSubmit,
    submit,
    handleComposerKeyDown,
    /** Model-supplied "Other"-style label, folded into the inline input. */
    otherLabel,
  };
}
