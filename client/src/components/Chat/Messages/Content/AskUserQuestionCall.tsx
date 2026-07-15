import { MessageCircleQuestion } from 'lucide-react';
import { getSubmittedAskAnswer, parseAskUserQuestionArgs } from '~/utils/approval';
import { useLocalize } from '~/hooks';

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
}: {
  args: string | Record<string, unknown> | undefined;
  output: string;
  toolCallId?: string;
  isSubmitting?: boolean;
}) {
  const localize = useLocalize();
  const question = parseAskUserQuestionArgs(args);
  /**
   * The part's own output arrives from the server only at finalize, and the
   * streaming handler's message copy can overwrite the optimistic store stamp
   * mid-stream — fall back to the locally-recorded submitted answer so the
   * Q&A record never blinks out while the resumed segment streams.
   */
  const effectiveOutput = output.length > 0 ? output : (getSubmittedAskAnswer(toolCallId) ?? '');
  const answered = effectiveOutput.length > 0;

  /**
   * While the turn is live and unanswered, the INTERACTIVE card (rendered from
   * the pendingAction's synthetic part) owns the question UI — rendering the
   * durable record too would duplicate it with a misleading "no answer" line.
   * Once the user answers, the submit handler stamps `output` onto this part,
   * so the record takes over immediately; an abandoned pause only shows its
   * "no answer" state after the turn is no longer submitting.
   */
  if (!answered && isSubmitting) {
    return null;
  }

  /**
   * Prefer the picked option's label over its wire value when they differ.
   * Multi-select answers are option values joined by ", " — map the segments
   * back to labels only when EVERY segment matches an option: values may
   * legally contain ", " themselves, and a partial mapping could mis-split
   * such a value into fragments that relabel as options the user never
   * picked. When any segment misses, show the raw answer untouched.
   */
  const exactLabel = question?.options?.find((option) => option.value === effectiveOutput)?.label;
  const mappedMultiLabel = (() => {
    if (exactLabel != null || question?.multiSelect !== true || question.options == null) {
      return null;
    }
    const labels = effectiveOutput
      .split(', ')
      .map((segment) => question.options?.find((option) => option.value === segment)?.label);
    return labels.every((label) => label != null) ? labels.join(', ') : null;
  })();
  const answerLabel = exactLabel ?? mappedMultiLabel ?? effectiveOutput;

  return (
    <div className="my-2 flex w-full flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
        {answered ? localize('com_ui_asked') : localize('com_ui_asking')}
      </div>
      <p className="text-sm font-medium text-text-primary">
        {question?.question ?? (answered ? localize('com_ui_asked') : localize('com_ui_asking'))}
      </p>
      {question?.description != null && question.description.length > 0 && (
        <p className="text-sm text-text-secondary">{question.description}</p>
      )}
      {answered ? (
        <p className="text-sm text-text-primary">
          <span className="font-medium text-text-secondary">{localize('com_ui_you_answered')}</span>{' '}
          {answerLabel}
        </p>
      ) : (
        <p className="text-sm italic text-text-secondary">
          {localize('com_ui_question_unanswered')}
        </p>
      )}
    </div>
  );
}
