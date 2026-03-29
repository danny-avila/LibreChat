import React, { useMemo, useRef } from 'react';
import { useMessageProcess } from '~/hooks';
import type { TMessageProps } from '~/common';
import type { TMessageChatContext } from '~/common/types';
import { useChatContext } from '~/Providers';
import MessageRender from './ui/MessageRender';
import MultiMessage from './MultiMessage';

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

export default function Message(props: TMessageProps) {
  const { conversation, handleScroll, isSubmitting } = useMessageProcess({
    message: props.message,
  });
  const chatCtx = useChatContext();
  const { message, currentEditId, setCurrentEditId } = props;

  /**
   * Stable ref for isSubmitting — the chatContext getter reads from this ref
   * at call-time, so callbacks always see the current value without it being
   * a reactive dependency that forces re-renders.
   */
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  /**
   * Create a stable context object for MessageRender. This memoization deliberately
   * excludes `isSubmitting` from deps — instead, isSubmitting is exposed as a getter
   * backed by `isSubmittingRef`, so the object reference stays the same across
   * isSubmitting changes while callbacks can still read the latest value.
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
          <MessageRender
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
