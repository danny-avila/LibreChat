import React, { useMemo, useRef } from 'react';
import { useMessageProcess } from '~/hooks';
import type { TMessageProps } from '~/common';
import type { TMessageChatContext } from '~/common/types';
import { useChatContext } from '~/Providers';

import MultiMessage from '~/components/Chat/Messages/MultiMessage';
import ContentRender from './ContentRender';

const MessageContainer = React.memo(function MessageContainer({
  handleScroll,
  children,
}: {
  handleScroll: (event?: unknown) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
      onWheel={handleScroll}
      onTouchMove={handleScroll}
    >
      {children}
    </div>
  );
});

export default function MessageContent(props: TMessageProps) {
  const { conversation, handleScroll, isSubmitting } = useMessageProcess({
    message: props.message,
  });
  const chatCtx = useChatContext();
  const { message, currentEditId, setCurrentEditId } = props;

  /** Stable ref for isSubmitting — chatContext getter reads from this at call-time */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  /**
   * Stable context object for ContentRender. Excludes `isSubmitting` from deps —
   * exposed as a getter backed by `isSubmittingRef` so the reference stays the same
   * across isSubmitting changes.
   */
  const chatContext: TMessageChatContext = useMemo(
    () => ({
      ask: chatCtx.ask,
      index: chatCtx.index,
      regenerate: chatCtx.regenerate,
      conversation: chatCtx.conversation,
      latestMessageId: chatCtx.latestMessageId,
      latestMessageDepth: chatCtx.latestMessageDepth,
      handleContinue: chatCtx.handleContinue,
      get isSubmitting() {
        return isSubmittingRef.current;
      },
    }),
    [
      chatCtx.ask,
      chatCtx.index,
      chatCtx.regenerate,
      chatCtx.conversation,
      chatCtx.latestMessageId,
      chatCtx.latestMessageDepth,
      chatCtx.handleContinue,
    ],
  );

  if (!message || typeof message !== 'object') {
    return null;
  }

  const { children, messageId = null } = message;

  /**
   * Only pass isSubmitting=true to the latest message. For all other messages,
   * isSubmitting is always false — a stable prop that won't trigger React.memo re-renders.
   */
  const isLatestMessage = messageId === chatCtx.latestMessageId;
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  return (
    <>
      <MessageContainer handleScroll={handleScroll}>
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <ContentRender
            {...props}
            isSubmitting={effectiveIsSubmitting}
            chatContext={chatContext}
          />
        </div>
      </MessageContainer>
      <MultiMessage
        key={messageId}
        messageId={messageId}
        conversation={conversation}
        messagesTree={children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
