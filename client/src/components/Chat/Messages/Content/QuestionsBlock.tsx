import { memo, useMemo } from 'react';
import { parseQuestions } from '~/utils/questions';
import { useLocalize } from '~/hooks';

/** A ```questions block in a reply, shown as a readable list; the composer popover
 *  (TextQuestionsPopover) is where the latest one gets answered. */
const QuestionsBlock = memo(function QuestionsBlock({ content }: { content: string }) {
  const localize = useLocalize();
  const questions = useMemo(() => parseQuestions('```questions\n' + content + '```'), [content]);
  if (questions == null) {
    return <span className="text-sm text-text-secondary">{localize('com_ui_loading')}</span>;
  }
  return (
    <ol className="my-2 list-decimal space-y-2 whitespace-normal pl-5 font-sans text-sm">
      {questions.map((q) => (
        <li key={q.id}>
          <span className="text-text-primary">{q.question}</span>
          {q.options != null && q.options.length > 0 && (
            <span className="block text-text-secondary">
              {q.options.map((o) => o.label).join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
});

export default QuestionsBlock;
