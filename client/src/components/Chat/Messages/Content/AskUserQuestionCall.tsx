import { MessageCircleQuestion, TriangleAlert } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import {
  getSubmittedAskAnswer,
  parseAskUserQuestionArgs,
  parseAskUserQuestionsArgs,
} from '~/utils/approval';
import AskUserQuestionProgress from './AskUserQuestionProgress';
import EmptyText from './Parts/EmptyText';
import { useLocalize } from '~/hooks';
import Container from './Container';

/**
 * Static rendering of a COMPLETED (or abandoned) `ask_user_question` tool call —
 * the durable record of the Q&A after the pause resolves. The generic tool card
 * is wrong here: it labels a no-output call "cancelled" and shows raw JSON args.
 * The interactive card ({@link AskUserQuestion}) renders only while the pause is
 * live; this component owns the part everywhere else (history, reload, exports).
 */
export default function AskUserQuestionCall({
  args,
  output,
  toolCallId,
  isSubmitting = false,
  failed = false,
  showCursor = false,
}: {
  args: string | Record<string, unknown> | undefined;
  output: string;
  toolCallId?: string;
  isSubmitting?: boolean;
  failed?: boolean;
  showCursor?: boolean;
}) {
  const localize = useLocalize();
  const question = parseAskUserQuestionArgs(args);
  const batch = parseAskUserQuestionsArgs(args);
  /**
   * The part's own output arrives from the server only at finalize, and the
   * streaming handler's message copy can overwrite the optimistic store stamp
   * mid-stream — fall back to the locally-recorded submitted answer so the
   * Q&A record never blinks out while the resumed segment streams.
   */
  const effectiveOutput = output.length > 0 ? output : (getSubmittedAskAnswer(toolCallId) ?? '');
  const batchAnswers = (() => {
    if (batch == null || effectiveOutput.length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(effectiveOutput) as { answers?: unknown };
      return parsed.answers != null && typeof parsed.answers === 'object'
        ? (parsed.answers as Record<string, string>)
        : null;
    } catch {
      return null;
    }
  })();
  const answered =
    !failed &&
    (batch != null
      ? batch.questions.every((item) => typeof batchAnswers?.[item.id] === 'string')
      : effectiveOutput.length > 0);

  /**
   * While the turn is live and unanswered, the INTERACTIVE card (rendered from
   * the pendingAction's synthetic part) owns the question UI — rendering the
   * durable record too would duplicate it with a misleading "no answer" line.
   * Until that pause actually starts (args still streaming, interrupt not yet
   * delivered) the progress card fills the gap. Once the user answers, the
   * submit handler stamps `output` onto this part, so the record takes over
   * immediately; an abandoned pause only shows its "no answer" state after
   * the turn is no longer submitting.
   */
  if (!answered && !failed && isSubmitting) {
    return <AskUserQuestionProgress args={args} toolCallId={toolCallId} />;
  }

  /**
   * The run resumes the moment the pause resolves (an answer submits, or a
   * schema-rejected call auto-retries), but its first token takes a beat to
   * arrive — hold the streaming cursor under the settled card so the turn
   * never looks stalled between the answer and the resumed text.
   */
  const resumingCursor =
    isSubmitting && showCursor ? (
      <Container>
        <EmptyText />
      </Container>
    ) : null;

  if (batch != null) {
    let statusLabel = localize('com_ui_asking');
    if (failed) {
      statusLabel = localize('com_ui_question_failed');
    } else if (answered) {
      statusLabel = localize('com_ui_asked');
    }
    return (
      <>
        <div className="my-2 flex w-full flex-col rounded-lg border border-border-light bg-surface-secondary">
          <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary">
            {failed ? (
              <TriangleAlert className="h-4 w-4 text-text-warning" aria-hidden="true" />
            ) : (
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
            )}
            {statusLabel}
          </div>
          <div className="px-3 pb-3">
            {batch.questions.map((item, index) => {
              const answer = batchAnswers?.[item.id];
              return (
                <div key={item.id} className={index > 0 ? 'border-t border-border-light pt-3' : ''}>
                  {item.header != null && (
                    <p className="text-xs font-medium text-text-secondary">{item.header}</p>
                  )}
                  <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
                    {item.question}
                  </p>
                  {item.description != null && (
                    <p className="mt-1 text-sm text-text-secondary [overflow-wrap:anywhere]">
                      {item.description}
                    </p>
                  )}
                  {typeof answer === 'string' && (
                    <p className="mt-1 text-sm text-text-primary [overflow-wrap:anywhere]">
                      <span className="font-medium text-text-secondary">
                        {localize('com_ui_you_answered')}
                      </span>{' '}
                      {formatAnswerLabel(item, answer)}
                    </p>
                  )}
                  {typeof answer !== 'string' && !failed && (
                    <p className="mt-1 text-sm italic text-text-secondary">
                      {localize('com_ui_question_unanswered')}
                    </p>
                  )}
                </div>
              );
            })}
            {failed && (
              <p className="mt-3 text-sm text-text-secondary">
                {localize('com_ui_question_failed_description')}
              </p>
            )}
          </div>
        </div>
        {resumingCursor}
      </>
    );
  }

  if (failed) {
    return (
      <>
        <div
          className="my-2 flex w-full flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-3"
          role="status"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-text-warning">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_question_failed')}
          </div>
          {question?.question != null && (
            <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
              {question.question}
            </p>
          )}
          <p className="text-sm text-text-secondary">
            {localize('com_ui_question_failed_description')}
          </p>
        </div>
        {resumingCursor}
      </>
    );
  }

  /**
   * Prefer the picked option's label over its wire value when they differ.
   * Multi-select answers are option values joined by ", " — map the segments
   * back to labels only when EVERY segment matches an option: values may
   * legally contain ", " themselves, and a partial mapping could mis-split
   * such a value into fragments that relabel as options the user never
   * picked. When any segment misses, show the raw answer untouched.
   */
  const answerLabel =
    question == null ? effectiveOutput : formatAnswerLabel(question, effectiveOutput);

  return (
    <>
      <div className="my-2 flex w-full flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          {answered ? localize('com_ui_asked') : localize('com_ui_asking')}
        </div>
        <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">
          {question?.question ?? (answered ? localize('com_ui_asked') : localize('com_ui_asking'))}
        </p>
        {question?.description != null && question.description.length > 0 && (
          <p className="text-sm text-text-secondary [overflow-wrap:anywhere]">
            {question.description}
          </p>
        )}
        {answered ? (
          <p className="text-sm text-text-primary [overflow-wrap:anywhere]">
            <span className="font-medium text-text-secondary">
              {localize('com_ui_you_answered')}
            </span>{' '}
            {answerLabel}
          </p>
        ) : (
          <p className="text-sm italic text-text-secondary">
            {localize('com_ui_question_unanswered')}
          </p>
        )}
      </div>
      {resumingCursor}
    </>
  );
}

function formatAnswerLabel(question: Agents.AskUserQuestionRequest, answer: string): string {
  const exactLabel = question.options?.find((option) => option.value === answer)?.label;
  if (exactLabel != null || question.multiSelect !== true || question.options == null) {
    return exactLabel ?? answer;
  }
  const labels = answer
    .split(', ')
    .map((segment) => question.options?.find((option) => option.value === segment)?.label);
  return labels.every((label) => label != null) ? labels.join(', ') : answer;
}
