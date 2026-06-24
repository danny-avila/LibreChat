import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button, TextareaAutosize } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import { useApprovalContext } from './ApprovalContext';
import { useLocalize } from '~/hooks';

/**
 * Renders an `ask_user_question` pause: the prompt, optional description, any
 * curated option buttons, and a free-form text answer. Each path submits the
 * answer through {@link useApprovalContext} to resume the paused run; the
 * continuation arrives on the existing SSE.
 */
export default function AskUserQuestion({
  actionId,
  question,
}: {
  actionId: string;
  question: Agents.AskUserQuestionRequest;
}) {
  const localize = useLocalize();
  const { submitAskAnswer, getStatus } = useApprovalContext();
  const [answer, setAnswer] = useState('');

  const status = getStatus(actionId);
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';

  if (status === 'submitted') {
    return null;
  }

  const trimmed = answer.trim();

  return (
    <div className="my-2 flex w-full flex-col gap-2 rounded-lg border border-border-light bg-surface-secondary p-3">
      <p className="text-sm font-medium text-text-primary">{question.question}</p>
      {question.description != null && question.description.length > 0 && (
        <p className="text-sm text-text-secondary">{question.description}</p>
      )}

      {question.options != null && question.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => submitAskAnswer(actionId, option.value)}
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
        placeholder={localize('com_ui_your_answer')}
        className="w-full resize-none rounded-md border border-border-light bg-surface-primary p-2 text-sm"
        aria-label={localize('com_ui_your_answer')}
      />

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="submit"
          disabled={trimmed.length === 0 || locked}
          onClick={() => submitAskAnswer(actionId, trimmed)}
        >
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
