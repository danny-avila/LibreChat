import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { parseToolTags } from '~/utils/toolTags';
import { useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

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
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      const segments = parseToolTags(text);

      // Fast path: no tool tags found — render as normal markdown
      if (segments.length === 1 && segments[0].type === 'text') {
        return <Markdown content={text} isLatestMessage={isLatestMessage} />;
      }

      // Mixed content: render text segments via Markdown, tool segments via ToolCall
      return (
        <>
          {segments
            .filter((s) => !(s.type === 'text' && !s.text.trim()))
            .map((segment, index) =>
              segment.type === 'text' ? (
                <Markdown
                  key={`text-${index}`}
                  content={segment.text}
                  isLatestMessage={isLatestMessage}
                />
              ) : (
                <ToolCall
                  key={`tool-${index}`}
                  name={segment.name}
                  args={segment.call}
                  output={segment.result ?? undefined}
                  initialProgress={segment.result === null ? 0.1 : 1}
                  isSubmitting={isSubmitting}
                  isLast={index === segments.length - 1 && isLatestMessage}
                />
              ),
            )}
        </>
      );
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    } else {
      return <>{text}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, text, isLatestMessage, isSubmitting]);

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
    </div>
  );
});

export default TextPart;
