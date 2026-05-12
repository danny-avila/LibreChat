import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
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
      // Preflight: assistant turn is streaming but no text has arrived yet.
      // The .result-streaming pulse dot is rendered as ::after on the
      // last-child of .result-streaming — and Markdown with empty content
      // renders nothing, so without a placeholder the dot drops out until
      // the first token lands. Render an empty paragraph so the pulse has
      // a stable anchor for the entire preflight window.
      if (showCursorState && !text) {
        return <p aria-hidden="true" className="m-0" />;
      }
      return <Markdown content={text} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={text} />;
    } else {
      return <>{text}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, text, isLatestMessage, showCursorState]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState ? 'result-streaming' : '',
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
