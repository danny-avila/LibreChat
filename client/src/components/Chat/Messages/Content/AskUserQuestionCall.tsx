import { MessageCircleQuestion } from 'lucide-react';
import { parseAskUserQuestionArgs } from '~/utils/approval';
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
}: {
  args: string | Record<string, unknown> | undefined;
  output: string;
}) {
  const localize = useLocalize();
  const question = parseAskUserQuestionArgs(args);
  const answered = output.length > 0;

  /** Prefer the picked option's label over its wire value when they differ. */
  const answerLabel = question?.options?.find((option) => option.value === output)?.label ?? output;

  return (
    <div className="my-2 flex w-full flex-col gap-1.5 rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
        {localize('com_ui_asked_a_question')}
      </div>
      <p className="text-sm font-medium text-text-primary">
        {question?.question ?? localize('com_ui_asked_a_question')}
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
