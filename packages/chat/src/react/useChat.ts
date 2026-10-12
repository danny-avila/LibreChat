import { useRef, useMemo, useEffect, useCallback } from 'react';
import type { TMessage, UIMessage, TAttachment } from 'librechat-data-provider';
import type {
  Chat,
  ToolOutput,
  ChatStatus,
  ChatViewOptions,
  SendMessageInput,
  ChatRequestOptions,
  ToolApprovalResponse,
} from '../core';
import { toView, toStoredMessages } from '../core';
import { useSnapshot } from './snapshot';

export type UseChatOptions = {
  chat: Chat;
  /** Renders message updates at most once per interval, in ms. Status and error render at once. */
  throttle?: number;
  /** Reattaches to the running generation on mount. Only the first consumer of a chat does. */
  resume?: boolean;
  view?: ChatViewOptions;
  /** Attachments delivered per message id that the message list does not hold yet. */
  liveAttachments?: Record<string, TAttachment[] | undefined>;
};

/** AI SDK `UseChatHelpers`, over a core {@link Chat}. */
export type UseChatHelpers = {
  id: string;
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  sendMessage: (input: SendMessageInput, options?: ChatRequestOptions) => Promise<void>;
  regenerate: (options?: { messageId?: string } & ChatRequestOptions) => Promise<void>;
  stop: () => Promise<void>;
  resumeStream: () => Promise<void>;
  clearError: () => void;
  /** Writes views back onto the stored messages; see `toStoredMessages`. */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  addToolApprovalResponse: (response: ToolApprovalResponse) => Promise<void>;
  addToolOutput: (output: ToolOutput) => Promise<void>;
};

const noLiveAttachments: Record<string, TAttachment[] | undefined> = {};

/** Chats a mounted `useChat({ resume: true })` already reattached. */
const resumed = new WeakSet<Chat>();

/**
 * AI SDK `useChat` for a core {@link Chat}, which a host constructs and may share between
 * components (AI SDK: the `chat` option). The chat's messages are mapped to `UIMessage`s per
 * message, and only message updates are throttled, so `ready` never renders beside stale
 * messages.
 */
export function useChat({
  chat,
  throttle,
  resume = false,
  view,
  liveAttachments = noLiveAttachments,
}: UseChatOptions): UseChatHelpers {
  const subscribe = useCallback((listener: () => void) => chat.subscribe(listener), [chat]);
  const snapshot = useRef<{ version: number; stored: TMessage[] }>();
  /** Keyed by the chat's change count as well as the list: a write can keep the same array. */
  const readMessages = useCallback(() => {
    const version = chat.version;
    const stored = chat.messages;
    const current = snapshot.current;
    if (current?.version === version && current.stored === stored) {
      return current;
    }
    snapshot.current = { version, stored };
    return snapshot.current;
  }, [chat]);
  const cache = useSnapshot(subscribe, readMessages, { throttle });
  const status = useSnapshot(subscribe, () => chat.status);
  const error = useSnapshot(subscribe, () => chat.error);

  useEffect(() => {
    if (!resume || resumed.has(chat)) {
      return;
    }
    resumed.add(chat);
    void chat.resumeStream();
  }, [chat, resume]);

  const messages = useMemo(
    () => cache.stored.map((message) => toView(message, liveAttachments[message.messageId], view)),
    [cache, liveAttachments, view],
  );

  const setMessages = useCallback<UseChatHelpers['setMessages']>(
    (update) => {
      const current = chat.messages;
      const next =
        typeof update === 'function'
          ? update(
              current.map((message) => toView(message, liveAttachments[message.messageId], view)),
            )
          : update;
      chat.setMessages(
        toStoredMessages(next, current, {
          chatId: chat.id,
          latestMessageId: current[current.length - 1]?.messageId,
        }),
      );
    },
    [chat, liveAttachments, view],
  );

  return useMemo(
    () => ({
      id: chat.id,
      messages,
      status,
      error,
      sendMessage: (input, options) => chat.sendMessage(input, options),
      regenerate: (options) => chat.regenerate(options),
      stop: () => chat.stop(),
      resumeStream: () => chat.resumeStream(),
      clearError: () => chat.clearError(),
      setMessages,
      addToolApprovalResponse: (response) => chat.addToolApprovalResponse(response),
      addToolOutput: (output) => chat.addToolOutput(output),
    }),
    [chat, messages, status, error, setMessages],
  );
}
