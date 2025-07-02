import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useChatContext, useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';
import ChartBuilder from '../../../../Messages/Content/ChartBuilder';

// Updated regex to handle multiline JSON better
const chartRegex =
  /^:::\s*chart\{identifier="([^"]+)"\s*type="([^"]*)"\s*title="([^"]*)"\}\s*\n?\[([\s\S]*?)\]\s*:::/;

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement
  | ReactElement<React.ComponentProps<typeof ChartBuilder>>;

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { messageId } = useMessageContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  // Check if text matches chart format and validate
  const isValidChart = useMemo(() => {
    const match = text.match(chartRegex);
    if (!match) return false;

    const [, identifier, type, title, dataString] = match;

    // Validate required fields
    if (!identifier || !type || !title || !dataString) return false;
    if (!['line', 'bar', 'pie'].includes(type)) return false;

    try {
      const data = JSON.parse(`[${dataString}]`);
      if (!Array.isArray(data) || data.length === 0) return false;

      // Validate data structure - check for label/value or at least 2 properties
      const firstItem = data[0];
      if (typeof firstItem !== 'object' || firstItem === null) return false;

      const hasLabelValue = firstItem.label !== undefined && firstItem.value !== undefined;
      const hasTwoKeys = Object.keys(firstItem).length >= 2;

      return hasLabelValue || hasTwoKeys;
    } catch (e) {
      console.error('Chart validation error:', e);
      return false;
    }
  }, [text]);

  const content: ContentType = useMemo(() => {
    if (isValidChart) {
      const match = text.match(chartRegex);
      if (match) {
        const [, identifier, type, title, dataString] = match;
        try {
          const data = JSON.parse(`[${dataString}]`);
          return <ChartBuilder identifier={identifier} type={type} title={title} data={data} />;
        } catch (e) {
          console.error('Failed to parse chart data:', e);
        }
      }
    }

    if (!isCreatedByUser) {
      return <Markdown content={text} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    } else {
      return <>{text}</>;
    }
  }, [isValidChart, text, isCreatedByUser, enableUserMsgMarkdown, isLatestMessage]);

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
