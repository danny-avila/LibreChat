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

  /**
   * `isSubmitting` is included in deps so that chatContext gets a new reference
   * when streaming starts/ends (2x per session). This ensures HoverButtons
   * re-renders to update regenerate/edit button visibility via useGenerationsByLatest.
   * The getter pattern is still valuable: callbacks reading chatContext.isSubmitting
   * at call-time always get the current value even between these re-renders.
   */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chatCtx.ask,
      chatCtx.index,
      chatCtx.regenerate,
      stableConversation,
      chatCtx.latestMessageId,
      chatCtx.latestMessageDepth,
      chatCtx.handleContinue,
      isSubmitting, // intentional: forces new reference on streaming start/end so HoverButtons re-renders
    ],
  );

  const messageId = message?.messageId ?? null;
  const isLatestMessage = messageId === chatCtx.latestMessageId;
  const effectiveIsSubmitting = isLatestMessage ? isSubmitting : false;

  return { chatContext, effectiveIsSubmitting };
}
