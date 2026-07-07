import { useCallback, useEffect, useMemo } from 'react';
import { atom, useRecoilState } from 'recoil';
import {
  ASK_USER_DECLINED_ANSWER,
  findLiveAskUserQuestion,
  splitOtherOption,
} from '~/utils/approval';
import { useResumeSubmit } from '~/components/Chat/Messages/Content/ApprovalContext';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useOptionalChatFormContext } from '~/Providers';
import { getAskAnswerDraftId } from '~/utils';

/** Dismissed action ids — recoil so every consumer reacts. */
const dismissedAskActionsAtom = atom<string[]>({
  key: 'askAnswerModeDismissedActions',
  default: [],
});

/** Currently highlighted option row, or nothing. */
const askAnswerSelectionAtom = atom<number | null>({
  key: 'askAnswerModeSelection',
  default: null,
});

/**
 * First-class "answer mode" for a live `ask_user_question` pause, with
 * select-then-confirm semantics (borrowed from Claude Code's AskUserQuestion
 * UI): rows highlight on click/arrow/digit and an explicit Submit (or Enter)
 * fires the answer. The composer IS the free-form answer box — its placeholder
 * swaps, Enter submits the typed text, and its autosave drafts under `draftId`
 * (the question's own key) so the conversation draft is stashed on entry and
 * restored once the question resolves. `Skip` resumes the run with a canned
 * decline notice; only the × dismiss leaves the pause standing.
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
  const { submitAskAnswer } = useResumeSubmit();
  /** Absent outside ChatView (Share/search render the answer card without the
   *  composer form) — resets are simply skipped there. */
  const resetComposer = useOptionalChatFormContext()?.reset;

  const dismissed = liveAsk != null && dismissedIds.includes(liveAsk.actionId);
  const active = liveAsk != null && !dismissed;
  /** Answer-phase draft key: handed to useAutoSave so the composer drafts
   *  under the question's own key while answer mode is live, leaving the
   *  conversation draft untouched until the swap-back restores it. */
  const draftId = active && liveAsk != null ? getAskAnswerDraftId(liveAsk.actionId) : null;
  const { choices: options, otherLabel } = useMemo(
    () => splitOtherOption(liveAsk?.question.options),
    [liveAsk],
  );

  /** Selection is per-question: a new pause must never inherit a stale
   *  highlight whose Enter would submit the previous question's choice. */
  useEffect(() => {
    setSelected(null);
  }, [liveAsk?.actionId, setSelected]);

  const dismiss = useCallback(() => {
    if (liveAsk) {
      setDismissedIds((prev) =>
        prev.includes(liveAsk.actionId) ? prev : [...prev, liveAsk.actionId],
      );
    }
  }, [liveAsk, setDismissedIds]);

  const canSubmit = active && typeof selected === 'number' && options[selected] != null;

  /** Fires the confirmed selection; returns true when an answer was sent. */
  const submit = useCallback((): boolean => {
    if (!liveAsk || !canSubmit || typeof selected !== 'number') {
      return false;
    }
    submitAskAnswer(liveAsk.actionId, options[selected].value);
    setSelected(null);
    // Anything left in the composer was a dead answer draft: clear it so the
    // key swap stores nothing under the ask key and the conversation draft
    // comes back into an empty box.
    resetComposer?.();
    return true;
  }, [liveAsk, canSubmit, selected, options, submitAskAnswer, setSelected, resetComposer]);

  /** Composer text answers the question directly; true when consumed. */
  const submitText = useCallback(
    (text: string): boolean => {
      if (!active || !liveAsk) {
        return false;
      }
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        submitAskAnswer(liveAsk.actionId, trimmed);
        setSelected(null);
        resetComposer?.();
      }
      return true;
    },
    [active, liveAsk, submitAskAnswer, setSelected, resetComposer],
  );

  /**
   * Explicitly decline: resumes the run with a canned notice so the model
   * knows the user chose not to answer. A client-side dismiss alone would
   * leave the run paused until expiry — a hung turn.
   */
  const skip = useCallback((): boolean => {
    if (!active || !liveAsk) {
      return false;
    }
    submitAskAnswer(liveAsk.actionId, ASK_USER_DECLINED_ANSWER);
    setSelected(null);
    resetComposer?.();
    return true;
  }, [active, liveAsk, submitAskAnswer, setSelected, resetComposer]);

  /** Selection steering from the empty composer; true when consumed. */
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active) {
        return false;
      }
      const composerText = e.currentTarget.value;
      if (composerText.trim().length > 0) {
        // The composer IS the free-form answer box: Enter submits the typed
        // text (before useTextarea's submitting-lock can swallow it).
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          return submitText(composerText);
        }
        return false;
      }
      if (options.length === 0) {
        if (e.key === 'Escape') {
          dismiss();
          return true;
        }
        return false;
      }
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(options.length, 9)) {
        e.preventDefault();
        setSelected(digit - 1);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(((selected ?? -1) + 1) % options.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(((selected ?? 0) - 1 + options.length) % options.length);
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
    [active, options, selected, canSubmit, submit, submitText, dismiss, setSelected],
  );

  return {
    active,
    liveAsk,
    options,
    dismissed,
    dismiss,
    selected,
    setSelected,
    canSubmit,
    submit,
    submitText,
    skip,
    handleComposerKeyDown,
    /** Model-supplied "Other"-style label, folded into the inline input. */
    otherLabel,
    draftId,
  };
}
