import { useContext, useMemo, useState } from 'react';
import { ChevronUp, TriangleAlert } from 'lucide-react';
import { Button, TextareaAutosize } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import { useAskSubmitStatus, useResumeSubmit } from './ApprovalContext';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import { ChatContext } from '~/Providers/ChatContext';
import { splitOtherOption } from '~/utils/approval';
import { useLocalize } from '~/hooks';

/**
 * Renders an `ask_user_question` pause: the prompt, optional description, any
 * curated option buttons, and a free-form text answer. Single-select options
 * submit on click; multi-select options toggle and Submit confirms the set
 * (plus any typed text). While this card is the LIVE pause's surface it
 * shares selection state and submit paths with {@link useAskAnswerMode}, so
 * the composer, the popover, and this card always agree on what will be
 * sent; outside a live pause (Share/search) it falls back to local state.
 */
export default function AskUserQuestion({
  actionId,
  question,
}: {
  actionId: string;
  question: Agents.AskUserQuestionRequest;
}) {
  const localize = useLocalize();
  const { getAskStatus } = useAskSubmitStatus();
  const { submitAskAnswer } = useResumeSubmit();
  const [answer, setAnswer] = useState('');
  const [localChecked, setLocalChecked] = useState<number[]>([]);
  /**
   * The composer popover is the primary answer surface — while it's VISIBLE
   * for this pause, rendering the card too duplicates the question. The card
   * takes over when the popover is collapsed (answer mode stays live; the
   * chevron re-expands it) or dismissed (and in contexts without a
   * ChatContext, where the popover can't exist).
   */
  const conversationId = useContext(ChatContext)?.conversation?.conversationId;
  const answerMode = useAskAnswerMode(conversationId);
  const { popoverVisible, collapsed, expand, liveAsk } = answerMode;
  const isLivePause = liveAsk?.actionId === actionId;

  /** Same fold as the popover: a model-supplied catch-all "Other" option
   *  becomes the free-form textarea's placeholder, not a submittable row. */
  const { choices, otherLabel } = useMemo(
    () => splitOtherOption(question.options),
    [question.options],
  );

  const status = getAskStatus(actionId);
  if (popoverVisible && isLivePause) {
    return null;
  }
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';

  if (status === 'submitted') {
    return null;
  }

  const multiSelect = question.multiSelect === true;
  /** Live pause: share the hook's checked set so the composer's Enter and
   *  this card submit exactly what the card displays. */
  const checkedIndices = isLivePause ? answerMode.checked : localChecked;
  const toggleIndex = (index: number) => {
    if (isLivePause) {
      answerMode.toggleChecked(index);
      return;
    }
    setLocalChecked((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const trimmed = answer.trim();
  const canSubmit = multiSelect
    ? checkedIndices.length > 0 || trimmed.length > 0
    : trimmed.length > 0;

  const submitSingle = (index: number) => {
    if (isLivePause) {
      answerMode.submitOption(index);
      return;
    }
    const value = choices[index]?.value;
    if (value != null) {
      submitAskAnswer(actionId, value);
    }
  };

  const submitCombined = () => {
    const values = multiSelect
      ? checkedIndices
          .map((index) => choices[index]?.value)
          .filter((value): value is string => typeof value === 'string')
      : [];
    if (trimmed.length > 0) {
      values.push(trimmed);
    }
    if (values.length === 0) {
      return;
    }
    if (isLivePause) {
      answerMode.submitAnswer(values);
      return;
    }
    submitAskAnswer(actionId, values.join(', '));
  };

  return (
    <div className="my-2 flex w-full flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{question.question}</p>
        {collapsed && isLivePause && (
          <button
            type="button"
            aria-label={localize('com_ui_expand')}
            className="rounded p-1 text-text-secondary hover:bg-surface-hover"
            onClick={expand}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {question.description != null && question.description.length > 0 && (
        <p className="text-sm text-text-secondary">{question.description}</p>
      )}

      {choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {choices.map((option, index) => (
            <Button
              key={option.value}
              size="sm"
              variant={multiSelect && checkedIndices.includes(index) ? 'submit' : 'outline'}
              role={multiSelect ? 'checkbox' : undefined}
              aria-checked={multiSelect ? checkedIndices.includes(index) : undefined}
              disabled={locked}
              onClick={() => (multiSelect ? toggleIndex(index) : submitSingle(index))}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      <TextareaAutosize
        value={answer}
        disabled={locked}
        onChange={(e) => setAnswer(e.target.value)}
        minRows={2}
        maxRows={12}
        placeholder={otherLabel ?? localize('com_ui_your_answer')}
        className="w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
        aria-label={localize('com_ui_your_answer')}
      />

      <div className="flex items-center gap-3">
        <Button size="sm" variant="submit" disabled={!canSubmit || locked} onClick={submitCombined}>
          {status === 'submitting' ? localize('com_ui_submitting') : localize('com_ui_submit')}
        </Button>
        {status === 'expired' && (
          <span className="flex items-center text-xs text-text-warning">
            <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_approval_expired')}
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center text-xs text-text-warning">
            <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {localize('com_ui_approval_error')}
          </span>
        )}
      </div>
    </div>
  );
}
