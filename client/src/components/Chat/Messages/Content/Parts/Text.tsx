import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import { extractSuggestions } from 'librechat-data-provider';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import SuggestedReplies from '~/components/Chat/Messages/Content/SuggestedReplies';
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

const TextPart = memo(function TextPart({ text, isCreatedByUser, showCursor }: TextPartProps) {
  const { isSubmitting = false, isLatestMessage = false } = useMessageContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor && isSubmitting, [showCursor, isSubmitting]);

  /**
   * Assistant replies may end with a hidden `<suggestions>` block. Strip it
   * from the visible text and surface it as clickable chips below the latest
   * assistant message once streaming settles. User messages are untouched.
   */
  const { displayText, suggestions } = useMemo(() => {
    if (isCreatedByUser) {
      return { displayText: text, suggestions: [] as string[] };
    }
    const parsed = extractSuggestions(text);
    return { displayText: parsed.text, suggestions: parsed.suggestions };
  }, [isCreatedByUser, text]);

  const showSuggestions =
    !isCreatedByUser && isLatestMessage && !isSubmitting && suggestions.length > 0;

  const content: ContentType = useMemo(() => {
    if (!isCreatedByUser) {
      return <Markdown content={displayText} isLatestMessage={isLatestMessage} />;
    } else if (enableUserMsgMarkdown) {
      return <MarkdownLite content={displayText} />;
    } else {
      return <>{displayText}</>;
    }
  }, [isCreatedByUser, enableUserMsgMarkdown, displayText, isLatestMessage]);

  return (
    <div
      className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!displayText.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
      )}
    >
      {content}
      {showSuggestions && <SuggestedReplies suggestions={suggestions} />}
    </div>
  );
});
TextPart.displayName = 'TextPart';

export default TextPart;
