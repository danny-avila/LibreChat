import { Suspense, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { DelayedRender } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TAttachment,
  SearchResultData,
  TMessageContentParts,
} from 'librechat-data-provider';
import type { MessagesViewContextValue } from '~/Providers/MessagesViewContext';
import { MessagesViewContext } from '~/Providers/MessagesViewContext';
import { UnfinishedMessage } from './MessageContent';
import { cn, mapAttachments } from '~/utils';
import { SearchContext } from '~/Providers';
import MarkdownLite from './MarkdownLite';
import store from '~/store';
import Part from './Part';

const SEARCH_VIEW_DEFAULTS: MessagesViewContextValue = {
  conversation: null,
  conversationId: null,
  isSubmitting: false,
  abortScroll: false,
  setAbortScroll: () => {},
  ask: () => Promise.resolve(),
  regenerate: () => {},
  handleContinue: () => {},
  index: 0,
  latestMessageId: undefined,
  latestMessageDepth: undefined,
  setLatestMessage: () => {},
  getMessages: () => [],
  setMessages: () => {},
};

const SearchContent = ({
  message,
  attachments,
  searchResults,
}: {
  message: TMessage;
  attachments?: TAttachment[];
  searchResults?: { [key: string]: SearchResultData };
}) => {
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const { messageId } = message;

  const attachmentMap = useMemo(() => mapAttachments(attachments ?? []), [attachments]);

  if (Array.isArray(message.content) && message.content.length > 0) {
    return (
      <MessagesViewContext.Provider value={SEARCH_VIEW_DEFAULTS}>
        <SearchContext.Provider value={{ searchResults }}>
          {message.content
            .filter((part: TMessageContentParts | undefined) => part)
            .map((part: TMessageContentParts | undefined, idx: number) => {
              if (!part) {
                return null;
              }

              const toolCallId =
                (part?.[ContentTypes.TOOL_CALL] as Agents.ToolCall | undefined)?.id ?? '';
              const partAttachments = attachmentMap[toolCallId];
              return (
                <Part
                  key={`display-${messageId}-${idx}`}
                  showCursor={false}
                  isSubmitting={false}
                  isCreatedByUser={message.isCreatedByUser}
                  attachments={partAttachments}
                  part={part}
                />
              );
            })}
          {message.unfinished === true && (
            <Suspense>
              <DelayedRender delay={250}>
                <UnfinishedMessage message={message} key={`unfinished-${messageId}`} />
              </DelayedRender>
            </Suspense>
          )}
        </SearchContext.Provider>
      </MessagesViewContext.Provider>
    );
  }

  return (
    <div
      className={cn(
        'markdown prose dark:prose-invert light w-full break-words',
        message.isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        message.isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-70',
      )}
      dir="auto"
    >
      <MarkdownLite content={message.text || ''} />
    </div>
  );
};

export default SearchContent;
