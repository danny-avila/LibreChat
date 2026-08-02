import { useCallback, useEffect, useMemo, useRef } from 'react';
import { atom, useRecoilState, useRecoilValue } from 'recoil';
import {
  useAskSubmitStatus,
  useResumeSubmit,
} from '~/components/Chat/Messages/Content/ApprovalContext';
import {
  ASK_USER_DECLINED_ANSWER,
  findLiveAskUserQuestion,
  splitOtherOption,
} from '~/utils/approval';
import { getAskAnswerDraftId, morphTransition } from '~/utils';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useOptionalChatFormContext } from '~/Providers';
import store from '~/store';

/**
 * Action ids the user moved into the chat: the popover is hidden AND the
 * composer is released (answer mode off), so the chat card is the question's
 * only surface until the card's chevron moves it back. One state for one
 * user-visible concept — a hidden popover whose composer stayed armed was
 * indistinguishable from one whose composer did not.
 */
const collapsedAskActionsAtom = atom<string[]>({
  key: 'askAnswerModeCollapsedActions',
  default: [],
});

/** Currently highlighted option row (keyboard cursor), or nothing. */
const askAnswerSelectionAtom = atom<number | null>({
  key: 'askAnswerModeSelection',
  default: null,
});

/** Checked option rows for a multi-select question — shared across the
 *  popover, the composer, and the chat card so every surface shows (and
 *  submits) the same set. */
const askAnswerCheckedAtom = atom<number[]>({
  key: 'askAnswerModeChecked',
  default: [],
});

/** Free-form answer handed between the composer and the in-message card. */
const askAnswerTextAtom = atom<{ actionId: string | null; text: string }>({
  key: 'askAnswerModeText',
  default: { actionId: null, text: '' },
});

/**
 * First-class "answer mode" for a live `ask_user_question` pause. Clicking an
 * option submits it immediately (multi-select clicks toggle instead, confirmed
 * by an explicit Submit); arrows/digits from the EMPTY composer steer a
 * keyboard highlight that Enter fires — but only while the popover is visible,
 * since it is the only surface that renders the highlight. The composer IS the
 * free-form answer box — its placeholder swaps, Enter submits the typed text,
 * and its autosave drafts under `draftId` (the question's own key) so the
 * conversation draft is stashed on entry and restored once the question
 * resolves.
 *
 * One way out short of answering: `collapse` (the popover's chevron, or
 * Escape) moves the question to the chat card AND releases the composer, so
 * the user can type a normal message; the card's chevron moves it back.
 * `Skip` resumes the run with a canned decline notice.
 *
 * `handleComposerKeyDown` only steers selection from the EMPTY composer and
 * reports whether it consumed the key.
 */
export default function useAskAnswerMode(conversationId?: string | null) {
  const enabled = conversationId != null && conversationId !== 'new';
  /** `select` projects straight to the live pause: streaming deltas leave the
   * settled ask part untouched, so structural sharing keeps this null (or the
   * same ask object) and the subscription stays quiet until a pause actually
   * starts or resolves. */
  const { data: liveAskData } = useGetMessagesByConvoId(enabled ? conversationId : '', {
    enabled,
    select: findLiveAskUserQuestion,
  });
  const liveAsk = enabled ? (liveAskData ?? null) : null;
  const [collapsedIds, setCollapsedIds] = useRecoilState(collapsedAskActionsAtom);
  const [selected, setSelected] = useRecoilState(askAnswerSelectionAtom);
  const [checked, setChecked] = useRecoilState(askAnswerCheckedAtom);
  const [answerDraft, setAnswerDraft] = useRecoilState(askAnswerTextAtom);
  const saveDrafts = useRecoilValue<boolean>(store.saveDrafts);
  const { submitAskAnswer } = useResumeSubmit();
  /** Recoil-backed so the lock/status works from the composer, which renders
   *  outside `ApprovalProvider` (where the context status would be inert). */
  const { getAskStatus } = useAskSubmitStatus();
  /** Absent outside ChatView (Share/search render the answer card without the
   *  composer form) — resets are simply skipped there. */
  const formContext = useOptionalChatFormContext();
  /** Resume callbacks may settle after this ChatForm has navigated to another
   * conversation (the form instance is intentionally reused across routes).
   * Keep the callback's current ownership observable without letting its old
   * closure reset a newer draft or selection. */
  const currentScopeRef = useRef({
    conversationId,
    actionId: liveAsk?.actionId,
    formContext,
  });
  currentScopeRef.current = {
    conversationId,
    actionId: liveAsk?.actionId,
    formContext,
  };
  const mountedRef = useRef(true);
  useEffect(() => {
    // Strict Mode runs setup, cleanup, then setup again in development; each
    // live setup must reassert ownership before a success callback can clean.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** The answer is in flight (or terminal): every submit path must become a
   *  no-op so a double-click or a stray Skip can't race a second resume. */
  const status = liveAsk != null ? getAskStatus(liveAsk.actionId) : 'idle';
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';
  /**
   * An EXPIRED question can no longer be answered, so it drops out of answer
   * mode entirely: the popover closes, the composer reverts to a normal
   * composer, and the chat card (always mounted for the live pause) becomes
   * the sole surface — it carries the only "this action expired" message, so
   * suppressing it behind an open popover would strand the user at a locked
   * card with no explanation. (`error`, unlike `expired`, stays active: it is
   * retryable — see the composer-preserving submit path.)
   *
   * A `submitted` question is likewise done — the run has resumed and there is
   * nothing left to answer. The chat card already self-hides on it; without the
   * same test here a card that outlives its strip (a resurrected copy, or a
   * submit whose store write couldn't run) holds the popover open over an
   * answered question with every option greyed out.
   */
  const answerable = liveAsk != null && status !== 'expired' && status !== 'submitted';
  /** Moved to the chat: the card owns the question and the composer is free. */
  const collapsed = answerable && collapsedIds.includes(liveAsk.actionId);
  /**
   * Answer mode: the popover is up AND the composer is the free-form answer
   * box. The two are deliberately the same condition — the composer's answer
   * role is only discoverable while the popover explains it.
   */
  const active = answerable && !collapsed;
  const popoverVisible = active;
  const multiSelect = liveAsk != null && liveAsk.question.multiSelect === true;
  /** Answer-phase draft key: handed to useAutoSave so the composer drafts
   *  under the question's own key while answer mode is live, leaving the
   *  conversation draft untouched until the swap-back restores it. */
  const draftId = active && liveAsk != null ? getAskAnswerDraftId(liveAsk.actionId) : null;
  const { choices: options, otherLabel } = useMemo(
    () => splitOtherOption(liveAsk?.question.options),
    [liveAsk],
  );
  const answerText = answerDraft.actionId === liveAsk?.actionId ? answerDraft.text : '';
  const setAnswerText = useCallback(
    (text: string) => {
      if (liveAsk) {
        setAnswerDraft({ actionId: liveAsk.actionId, text });
      }
    },
    [liveAsk, setAnswerDraft],
  );

  /** Selection state is per-question: a new pause must never inherit a stale
   *  highlight (or checks) whose Enter would submit the previous question's
   *  choice. */
  useEffect(() => {
    setSelected(null);
    setChecked([]);
  }, [liveAsk?.actionId, setSelected, setChecked]);

  /** Popover ⇄ chat-card handoffs run inside a view transition: both
   *  surfaces carry the same `view-transition-name`, so the browser morphs
   *  one into the other instead of swapping. Both are user-event driven,
   *  which morphTransition's synchronous flush requires. */
  const collapse = useCallback(() => {
    if (liveAsk) {
      const composerAnswer = formContext?.getValues('text') ?? answerText;
      morphTransition(() => {
        setAnswerDraft({ actionId: liveAsk.actionId, text: composerAnswer });
        setCollapsedIds((prev) =>
          prev.includes(liveAsk.actionId) ? prev : [...prev, liveAsk.actionId],
        );
      });
    }
  }, [liveAsk, formContext, answerText, setAnswerDraft, setCollapsedIds]);

  const expand = useCallback(() => {
    if (liveAsk) {
      morphTransition(() =>
        setCollapsedIds((prev) => prev.filter((id) => id !== liveAsk.actionId)),
      );
    }
  }, [liveAsk, setCollapsedIds]);

  /** Pure check toggle: the keyboard highlight is steered only by the
   *  composer's digit/arrow shortcuts, so a mouse toggle never leaves a
   *  row painted `selected` after it is unchecked. */
  const toggleChecked = useCallback(
    (index: number) => {
      setChecked((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
      );
    },
    [setChecked],
  );

  const canSubmit =
    active &&
    !locked &&
    (multiSelect ? checked.length > 0 : typeof selected === 'number' && options[selected] != null);

  /**
   * Shared answer dispatch: sends the run's resume and clears the phase.
   * Gated on the live pause (NOT `active` — the chat card must still answer a
   * dismissed question) and on `locked` (no duplicate resumes while one is in
   * flight).
   *
   * The selection/composer cleanup runs ONLY after the resume is accepted (in
   * `submitAskAnswer`'s success path): a failed resume — the 16k answer-cap
   * 400, an expired action, a network error — leaves `status` re-answerable,
   * so wiping the composer (the user's only copy of a free-form answer) up
   * front would lose it. The composer only resets when its text was consumed
   * by the answer or when the draft machinery will restore the stashed
   * conversation draft; with drafts disabled and an option-click answer the
   * typed text is left alone.
   */
  const submitValues = useCallback(
    (values: string[], consumedComposerText = false): boolean => {
      if (!liveAsk || locked || values.length === 0) {
        return false;
      }
      const wasActive = active;
      const submittedConversationId = conversationId;
      const submittedActionId = liveAsk.actionId;
      const submittedComposerText = formContext?.getValues('text') ?? '';
      submitAskAnswer(liveAsk.actionId, values.join(', '), {
        onSuccess: () => {
          const currentScope = currentScopeRef.current;
          if (
            !mountedRef.current ||
            currentScope.conversationId !== submittedConversationId ||
            currentScope.actionId !== submittedActionId
          ) {
            return;
          }
          setSelected(null);
          setChecked([]);
          setAnswerDraft((current) =>
            current.actionId === submittedActionId
              ? { actionId: submittedActionId, text: '' }
              : current,
          );
          if (
            (consumedComposerText || (wasActive && saveDrafts)) &&
            currentScope.formContext?.getValues('text') === submittedComposerText
          ) {
            currentScope.formContext.reset();
          }
        },
      });
      return true;
    },
    [
      liveAsk,
      locked,
      active,
      saveDrafts,
      conversationId,
      formContext,
      submitAskAnswer,
      setSelected,
      setChecked,
      setAnswerDraft,
    ],
  );

  const checkedValues = useCallback(
    () =>
      checked
        .map((index) => options[index]?.value)
        .filter((value): value is string => typeof value === 'string'),
    [checked, options],
  );

  /** Single-select click path: one click on an option IS the answer. */
  const submitOption = useCallback(
    (index: number): boolean => {
      const option = options[index];
      if (!option) {
        return false;
      }
      return submitValues([option.value]);
    },
    [options, submitValues],
  );

  /**
   * Confirm path (Enter / multi-select Submit); true when an answer was sent.
   * On multi-select any `freeText` (the composer's current value) rides along
   * with the checked options — the Submit button must never silently drop
   * text the footer hint invited.
   */
  const submit = useCallback(
    (freeText?: string): boolean => {
      const trimmed = freeText?.trim() ?? '';
      if (multiSelect) {
        const values = checkedValues();
        if (trimmed.length > 0) {
          values.push(trimmed);
        }
        return submitValues(values, trimmed.length > 0);
      }
      if (typeof selected !== 'number') {
        return false;
      }
      return submitOption(selected);
    },
    [multiSelect, checkedValues, selected, submitValues, submitOption],
  );

  /** Composer text answers the question directly; true when consumed. On a
   *  multi-select question any checked options ride along with the text. */
  const submitText = useCallback(
    (text: string): boolean => {
      if (!active || !liveAsk) {
        return false;
      }
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        submitValues(multiSelect ? [...checkedValues(), trimmed] : [trimmed], true);
      }
      return true;
    },
    [active, liveAsk, multiSelect, checkedValues, submitValues],
  );

  /**
   * Answer with explicit values from any surface (the chat card's combined
   * multi-select + free-text submit). Routed through {@link submitValues} so
   * the in-flight guard and composer/draft cleanup apply everywhere.
   */
  const submitAnswer = useCallback(
    (values: string[]): boolean => submitValues(values),
    [submitValues],
  );

  /**
   * Explicitly decline: resumes the run with a canned notice so the model
   * knows the user chose not to answer. A client-side dismiss alone would
   * leave the run paused until expiry — a hung turn.
   */
  const skip = useCallback((): boolean => {
    if (!active) {
      return false;
    }
    return submitValues([ASK_USER_DECLINED_ANSWER]);
  }, [active, submitValues]);

  /** Selection steering from the empty composer; true when consumed. */
  const handleComposerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!active) {
        return false;
      }
      /**
       * Let IME composition commit normally: with a CJK keyboard, Enter
       * commits the in-progress composition rather than submitting, and the
       * composition buffer can leave `value` empty mid-compose — so bail
       * before ANY Enter-submit or digit/arrow steering. Mirrors the composer
       * guard in `useTextarea` (Safari reports `isComposing` inconsistently,
       * hence the `key`/`keyCode` fallbacks); this handler runs first, so the
       * guard must live here too.
       */
      if (e.nativeEvent.isComposing || e.key === 'Process' || e.keyCode === 229) {
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
      /**
       * Option steering (digits/arrows/Enter-on-highlight) only while the
       * popover — the sole surface that renders the highlight and checks — is
       * actually visible. While collapsed, digits must type normally: eating
       * the leading "2" of "2pm works" to move an invisible highlight would
       * corrupt the free-form answer.
       */
      if (options.length === 0 || !popoverVisible) {
        if (e.key === 'Escape') {
          collapse();
          return true;
        }
        return false;
      }
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= Math.min(options.length, 9)) {
        e.preventDefault();
        if (multiSelect) {
          setSelected(digit - 1);
          toggleChecked(digit - 1);
        } else {
          setSelected(digit - 1);
        }
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
        collapse();
        return true;
      }
      return false;
    },
    [
      active,
      options,
      selected,
      multiSelect,
      popoverVisible,
      canSubmit,
      submit,
      submitText,
      toggleChecked,
      collapse,
      setSelected,
    ],
  );

  /**
   * Digit shortcuts while the POPOVER itself holds focus (e.g. a row/Skip
   * button was clicked or tabbed to). A number activates its option exactly
   * like a click — single-select submits, multi toggles — so numbers work no
   * matter where focus landed, not only from the empty composer. No
   * highlight/Enter dance here: on the popover the options are buttons whose
   * action IS the click, and intercepting Enter would fight the focused
   * button. Returns whether the key was consumed.
   */
  const handlePopoverKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!active || locked || options.length === 0) {
        return false;
      }
      const digit = Number.parseInt(e.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > Math.min(options.length, 9)) {
        return false;
      }
      e.preventDefault();
      if (multiSelect) {
        toggleChecked(digit - 1);
      } else {
        submitOption(digit - 1);
      }
      return true;
    },
    [active, locked, options, multiSelect, toggleChecked, submitOption],
  );

  return {
    active,
    liveAsk,
    options,
    collapsed,
    collapse,
    expand,
    popoverVisible,
    multiSelect,
    locked,
    selected,
    setSelected,
    checked,
    toggleChecked,
    answerText,
    setAnswerText,
    canSubmit,
    submit,
    submitOption,
    submitText,
    submitAnswer,
    skip,
    handleComposerKeyDown,
    handlePopoverKeyDown,
    /** The last submission failed but the question is still answerable — the
     *  popover surfaces this so a composer/popover answer doesn't fail
     *  silently (the chat card's error line is hidden while the popover is up). */
    errored: status === 'error',
    /** Model-supplied "Other"-style label, folded into the inline input. */
    otherLabel,
    draftId,
  };
}
