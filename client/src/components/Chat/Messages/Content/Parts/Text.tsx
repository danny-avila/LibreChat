import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useChatContext, useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';
import { ContentEnhancer } from '~/components/Chat/Messages/Content/ContentEnhancer';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { messageId } = useMessageContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  // Process content through the enhancer - this is the only addition
  const { processedText, enhancedElements } = useMemo(() => {
    return ContentEnhancer.process(text, isCreatedByUser);
  }, [text, isCreatedByUser]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={processedText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={processedText} />;
    } else {
      return <>{processedText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, processedText, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!text.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
      {enhancedElements}
    </div>
  );
});

export default TextPart;
