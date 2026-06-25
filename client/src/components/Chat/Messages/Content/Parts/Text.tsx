import { memo, useMemo, ReactElement } from 'react';
import { useRecoilValue } from 'recoil';
import { extractSuggestions, extractMemory } from 'librechat-data-provider';
import type { ExtractedMemory } from 'librechat-data-provider';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import Markdown from '~/components/Chat/Messages/Content/Markdown';
import SuggestedReplies from '~/components/Chat/Messages/Content/SuggestedReplies';
import SaveMemoryBanner from '~/components/Chat/Messages/Content/SaveMemoryBanner';
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
   * Assistant replies may end with hidden `<suggestions>` and/or `<memory>`
   * blocks. Strip both from the visible text and surface them below the latest
   * assistant message once streaming settles: suggestions as clickable chips,
   * a memory block as an editable "Save to memory?" banner. User messages are
   * untouched.
   */
  const { displayText, suggestions, memory } = useMemo(() => {
    if (isCreatedByUser) {
      return {
        displayText: text,
        suggestions: [] as string[],
        memory: null as ExtractedMemory | null,
      };
    }
    const withoutSuggestions = extractSuggestions(text);
    const withoutMemory = extractMemory(withoutSuggestions.text);
    return {
      displayText: withoutMemory.text,
      suggestions: withoutSuggestions.suggestions,
      memory: withoutMemory.memory,
    };
  }, [isCreatedByUser, text]);

  const isLatestSettled = !isCreatedByUser && isLatestMessage && !isSubmitting;
  const showSuggestions = isLatestSettled && suggestions.length > 0;
  const showMemory = isLatestSettled && memory != null;

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
      {showMemory && memory != null && <SaveMemoryBanner memory={memory} />}
    </div>
  );
});
TextPart.displayName = 'TextPart';

export default TextPart;
