import { Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { UnfinishedMessage } from './MessageContent';
import { DelayedRender } from '~/components/ui';
import MarkdownLite from './MarkdownLite';
import { cn } from '~/utils';
import store from '~/store';
import Part from './Part';

const SearchContent = ({ message }: { message: TMessage }) => {
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const { messageId } = message;
  if (Array.isArray(message.content) && message.content.length > 0) {
    return (
      <>
        {message.content
          .filter((part: TMessageContentParts | undefined) => part)
          .map((part: TMessageContentParts | undefined, idx: number) => {
            if (!part) {
              return null;
            }
            return (
              <Part
                key={`display-${messageId}-${idx}`}
                showCursor={false}
                isSubmitting={false}
                isCreatedByUser={message.isCreatedByUser}
                messageId={message.messageId}
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
      </>
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
