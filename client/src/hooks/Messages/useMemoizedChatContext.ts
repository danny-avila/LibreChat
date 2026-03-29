import { useRef, useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageChatContext } from '~/common/types';
import { useChatContext } from '~/Providers';

/**
 * Creates a stable `TMessageChatContext` object for memo'd message components.
 *
 * Subscribes to `useChatContext()` internally (intended to be called from non-memo'd
 * wrapper components like `Message` and `MessageContent`), then produces:
 * - A `chatContext` object that stays referentially stable during streaming
 *   (uses a getter for `isSubmitting` backed by a ref)
 * - A stable `conversation` reference that only updates when rendering-relevant fields change
 * - An `effectiveIsSubmitting` value (false for non-latest messages)
 */
export default function useMemoizedChatContext(
  message: TMessage | null | undefined,
  isSubmitting: boolean,
) {
  const chatCtx = useChatContext();

  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  /**
   * Stabilize conversation: only update when rendering-relevant fields change,
   * not on every metadata update (e.g., title generation).
   */
  const stableConversation = useMemo(
    () => chatCtx.conversation,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chatCtx.conversation?.conversationId,
      chatCtx.conversation?.endpoint,
      chatCtx.conversation?.endpointType,
      chatCtx.conversation?.model,
      chatCtx.conversation?.agent_id,
      chatCtx.conversation?.assistant_id,
    ],
  );

  const chatContext: TMessageChatContext = useMemo(
    () => ({
      ask: chatCtx.ask,
      index: chatCtx.index,
      regenerate: chatCtx.regenerate,
      conversation: stableConversation,
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
      stableConversation,
      chatCtx.latestMessageId,
      chatCtx.latestMessageDepth,
      chatCtx.handleContinue,
    ],
  );

  const messageId = message?.messageId ?? null;
  const isLatestMessage = messageId === chatCtx.latestMessageId;
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  return { chatContext, effectiveIsSubmitting };
}
