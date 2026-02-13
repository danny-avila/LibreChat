import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import ToolCall from '~/components/Chat/Messages/Content/ToolCall';
import { useMessageContext } from '~/Providers';
import { parseToolTags } from '~/utils/toolTags';
import { cn } from '~/utils';
import store from '~/store';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

const getToolName = (call: string) => {
  const trimmed = call.trim();
  if (!trimmed) {
    return 'tool';
  }

  const parenthesisIndex = trimmed.indexOf('(');
  const candidateName = parenthesisIndex === -1 ? trimmed : trimmed.slice(0, parenthesisIndex);
  return candidateName.trim().length > 0 ? candidateName.trim() : 'tool';
};

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  const content = useMemo(() => {
    if (!isCreatedByUser) {
      const segments = parseToolTags(text);
      const hasToolSegments = segments.some((segment) => segment.type === 'tool');
      if (!hasToolSegments) {
        return <Markdown content={text} isLatestMessage={isLatestMessage} />;
      }

      const filteredSegments = segments.filter(
        (segment) => !(segment.type === 'text' && !segment.text.trim()),
      );

      return filteredSegments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <Markdown
              key={`tool-tag-text-${index}`}
              content={segment.text}
              isLatestMessage={isLatestMessage}
            />
          );
        }

        return (
          <ToolCall
            key={`tool-tag-call-${index}`}
            name={getToolName(segment.call)}
            args={segment.call}
            output={segment.result ?? undefined}
            initialProgress={segment.result === null ? 0.1 : 1}
            isSubmitting={isSubmitting}
            isLast={index === filteredSegments.length - 1}
          />
        );
      });
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
