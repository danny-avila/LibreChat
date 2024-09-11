import { memo, useMemo } from 'react';
import { useChatContext } from '~/Providers';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { cn } from '~/utils';

type TextPartProps = {
  text: string;
  isCreatedByUser: boolean;
  messageId: string;
  showCursor: boolean;
};

const TextPart = memo(({ text, isCreatedByUser, messageId, showCursor }: TextPartProps) => {
  const { isSubmitting, latestMessage } = useChatContext();
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser ? 'whitespace-pre-wrap dark:text-gray-20' : 'dark:text-gray-70',
      )}
    >
      {!isCreatedByUser ? (
        <Markdown content={text} showCursor={showCursorState} isLatestMessage={isLatestMessage} />
      ) : (
        <>{text}</>
      )}
    </div>
  );
});

export default TextPart;
