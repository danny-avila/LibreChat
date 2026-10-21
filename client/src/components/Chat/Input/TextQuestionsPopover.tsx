import { memo, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import { useAskSubmitStatus } from '~/components/Chat/Messages/Content/ApprovalContext';
import AskUserQuestions from '~/components/Chat/Messages/Content/AskUserQuestions';
import { parseQuestions, TEXT_ASK_PREFIX } from '~/utils/questions';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { getAllContentText } from '~/utils/messages';
import { useComposerOverlay } from './overlay';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

/**
 * Composer popover for follow-up questions the assistant wrote as a ```questions
 * block in its last reply: pick answers instead of typing them. Submitting sends
 * them as the next user message; closing it leaves the composer for a free answer.
 */
const TextQuestionsPopover = memo(function TextQuestionsPopover({
  conversationId,
}: {
  conversationId: string;
}) {
  const localize = useLocalize();
  const { isSubmitting } = useChatContext();
  const latestMessage = useLatestMessage(0);
  const { getAskStatus } = useAskSubmitStatus();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const questions = useMemo(
    () =>
      latestMessage != null && latestMessage.isCreatedByUser !== true
        ? parseQuestions(getAllContentText(latestMessage))
        : null,
    [latestMessage],
  );
  const actionId = `${TEXT_ASK_PREFIX}${latestMessage?.messageId ?? ''}`;
  const visible =
    !isSubmitting &&
    questions != null &&
    dismissed !== actionId &&
    getAskStatus(actionId) !== 'submitted';
  useComposerOverlay(conversationId, visible);

  if (!visible) {
    return null;
  }

  return (
    <div className="absolute bottom-28 z-10 w-full">
      <div className="popover border-token-border-light flex max-h-[70vh] flex-col rounded-2xl border bg-surface-primary-alt shadow-lg">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-light px-3 py-2">
          <p className="text-sm font-medium text-text-primary">
            {localize(
              questions.length === 1 ? 'com_ui_asking_questions_one' : 'com_ui_asking_questions',
              { 0: questions.length },
            )}
          </p>
          <TooltipAnchor
            description={localize('com_ui_answer_yourself')}
            side="top"
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={localize('com_ui_answer_yourself')}
                className="size-11 rounded-md text-text-secondary"
                onClick={() => setDismissed(actionId)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            }
          />
        </div>
        <AskUserQuestions actionId={actionId} questions={questions} />
      </div>
    </div>
  );
});

export default TextQuestionsPopover;
