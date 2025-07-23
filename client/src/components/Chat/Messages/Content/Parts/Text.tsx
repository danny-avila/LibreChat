import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import { useChatContext, useMessageContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';
import ChartRenderer from '~/components/Chat/Messages/Content/ChartRenderer';

type TextPartProps = {
  text: string;
  showCursor: boolean;
  isCreatedByUser: boolean;
};

type ContentType =
  | ReactElement<React.ComponentProps<typeof Markdown>>
  | ReactElement<React.ComponentProps<typeof MarkdownLite>>
  | ReactElement;

// Minimal chart parsing function (moved from the bloated version)
const parseChartBlocks = (text: string) => {
  const chartRegex = /:::(bar|line)chart\{([^}]+)\}\n([\s\S]*?)\n:::/g;
  const charts: any[] = [];
  let cleanedText = text;
  let match;

  while ((match = chartRegex.exec(text)) !== null) {
    const [fullMatch, chartType, attributes, jsonData] = match;

    try {
      const attrMatches = attributes.match(/(\w+)="([^"]+)"/g) || [];
      const attrs: Record<string, string> = {};

      attrMatches.forEach((attr) => {
        const [key, value] = attr.split('=');
        attrs[key] = value.replace(/"/g, '');
      });

      const parsedData = JSON.parse(jsonData.trim());

      charts.push({
        type: chartType as 'bar' | 'line',
        identifier: attrs.identifier || `chart-${Date.now()}`,
        complexity: (attrs.complexity as 'simple' | 'moderate' | 'complex') || 'simple',
        title: attrs.title || 'Chart',
        data: parsedData,
      });

      cleanedText = cleanedText.replace(fullMatch, '');
    } catch (error) {
      console.error('Error parsing chart block:', error);
    }
  }

  return { charts, cleanedText: cleanedText.trim() };
};

const TextPart = memo(({ text, isCreatedByUser, showCursor }: TextPartProps) => {
  const { messageId } = useMessageContext();
  const { isSubmitting, latestMessage } = useChatContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(
    () => messageId === latestMessage?.messageId,
    [messageId, latestMessage?.messageId],
  );

  // Only parse charts for non-user messages
  const { charts, cleanedText } = useMemo(() => {
    if (!isCreatedByUser) {
      return parseChartBlocks(text);
    }
    return { charts: [], cleanedText: text };
  }, [text, isCreatedByUser]);

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={cleanedText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={cleanedText} />;
    } else {
      return <>{cleanedText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, cleanedText, isLatestMessage]);

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
      {charts.length > 0 && <ChartRenderer charts={charts} />}
    </div>
  );
});

export default TextPart;
