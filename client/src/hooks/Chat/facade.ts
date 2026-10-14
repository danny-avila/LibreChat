import { useMemo, useState, useEffect, useReducer, useCallback, useRef } from 'react';
import { useStore } from 'jotai';
import { Constants } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useSnapshot, ReactQueryChatState, useChat as useCoreChat } from '@librechat/chat/react';
import { toView, findLatest, getErrorText, getChatStatus, toStoredMessages } from '@librechat/chat';
import type { UseChatHelpers as CoreChatHelpers } from '@librechat/chat/react';
import type { Chat, ChatStatus, SendMessageInput } from '@librechat/chat';
import type { TMessage, UIMessage } from 'librechat-data-provider';
import type { TAskProps, TOptions } from '~/common';
import type { ChatContract } from './contract';
import { useChatContext } from '~/Providers/ChatContext';
import { resolveToolFailure } from './outcome';
import { resumeRequestsAtom } from './resume';

export type { ChatStatus, SendMessageInput };
export { getChatStatus };

/**
 * Submits a turn. Takes the contract's `ask` arguments, or a user message in the AI SDK shape,
 * which is sent as the `ask` call it describes; `{ text }` is already both.
 */
export type SendMessage = (
  message: TAskProps | SendMessageInput,
  options?: TOptions,
) => false | void;

/**
 * The `useChat` surface of `@ai-sdk/react@4.0.117` (`UseChatHelpers`), over LibreChat's chat
 * contract. Passing a core `Chat` returns that chat's helpers instead. Tool decisions and answers
 * (`addToolApprovalResponse`, `addToolOutput`) are left out here: the contract's turns run outside
 * a `Chat`, which is what holds the pending pause.
 */
export type UseChatHelpers = {
  /** The conversation the messages are read from (the contract's `messagesKey`); AI SDK's chat id. */
  id: string | undefined;
  /** The cached messages as `UIMessage`s, re-read whenever the message cache is written. */
  messages: UIMessage[];
  status: ChatStatus;
  /** Set when the latest message is an error; LibreChat reports errors as messages. */
  error: Error | undefined;
  /** Submits a turn through the contract's `ask`; see {@link SendMessage}. */
  sendMessage: SendMessage;
  /** Regenerates the response to `messageId`, or the latest message of the branch. */
  regenerate: (options?: { messageId?: string }) => void;
  stop: () => Promise<void>;
  /**
   * Reattaches this chat to its running generation, if the server has one. The request is
   * answered by the resume-on-load path the chat view mounts for its pane, which checks the
   * stream status and attaches through the host transport. It resolves once requested. It does
   * nothing for a new chat or one already attached, and a request for a conversation no chat view
   * shows waits until one does.
   */
  resumeStream: () => Promise<void>;
  /**
   * Returns an `error` chat to `ready`. The failed message stays in the list; the chat reads as
   * `ready` until its latest message changes.
   */
  clearError: () => void;
  /**
   * Writes messages back to the cache, keeping the stored fields the UI view omits. A message
   * with no stored counterpart joins the active conversation under the message before it, or
   * under the active branch's tail when the message before it is on another branch, unless its
   * metadata names a parent. A message keeps the conversation it is stored under.
   */
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
};

export type UseChatOptions = {
  /** Renders message updates at most once per interval, in ms. Status renders at once. */
  throttle?: number;
  /** Requests a reattach to the running generation on mount; see `resumeStream`. */
  resume?: boolean;
};

/** Options for a `useChat` that runs on a core `Chat` (AI SDK: the `chat` option). */
export type UseCoreChatOptions = UseChatOptions & { chat: Chat };

const viewOptions = { resolveToolFailure };

/** Failed messages whose error a caller cleared, shared by every consumer of the chat. */
const clearedErrors = new WeakSet<TMessage>();

const readStatus = (isSubmitting: boolean, latest: TMessage | undefined): ChatStatus => {
  const status = getChatStatus(isSubmitting, latest);
  return status === 'error' && latest && clearedErrors.has(latest) ? 'ready' : status;
};

/**
 * The pane's message cache entry as a chat state. Writes go through the contract, which writes
 * every key the pane reads; the subscription delivers each write after the task that made it.
 */
const useChatState = (contract: ChatContract) => {
  const queryClient = useQueryClient();
  const latest = useRef(contract);
  latest.current = contract;
  const { messagesKey } = contract;
  const state = useMemo(
    () =>
      new ReactQueryChatState({
        queryClient,
        key: messagesKey,
        read: () => latest.current.getMessages(),
        write: (messages) => latest.current.setMessages(messages),
      }),
    [queryClient, messagesKey],
  );
  const subscribe = useCallback((listener: () => void) => state.subscribe(listener), [state]);
  return { state, subscribe };
};

/** Regenerates the response to `messageId`, or the latest message of the branch. */
const useRegenerate = (
  getMessages: ChatContract['getMessages'],
  latestMessageId: string | undefined,
  regenerateTarget: ChatContract['regenerate'],
) =>
  useCallback(
    (options?: { messageId?: string }) => {
      const messageId = options?.messageId ?? latestMessageId;
      const target = getMessages()?.find((message) => message.messageId === messageId);
      regenerateTarget(
        target
          ? {
              messageId: target.messageId,
              parentMessageId: target.parentMessageId,
              isCreatedByUser: target.isCreatedByUser,
            }
          : { messageId },
      );
    },
    [getMessages, latestMessageId, regenerateTarget],
  );

/** The `useChat` members that need no message list. */
export type ChatActions = Pick<
  UseChatHelpers,
  'id' | 'status' | 'sendMessage' | 'regenerate' | 'stop' | 'resumeStream'
>;

/** `ask` arguments for a `sendMessage` call, which may carry an AI SDK user message. */
const toAskProps = (message: TAskProps | SendMessageInput): TAskProps => {
  if (!('parts' in message)) {
    return message;
  }
  const { parentMessageId } = message.metadata ?? {};
  return {
    text: message.parts.map((part) => part.text).join(''),
    /** A root message's view carries a `null` parent, which `ask` would read as "append to the
     *  branch tail"; the turn asked to attach at the root. */
    ...(parentMessageId !== undefined && {
      parentMessageId: parentMessageId ?? Constants.NO_PARENT,
    }),
  };
};

/**
 * `sendMessage` and `resumeStream` for the chat `id`, shared by `useChat` and `useChatActions`.
 * Resume requests are a set per conversation, so every consumer that asks shares one reattach.
 */
function useTurnActions(ask: ChatContract['ask'], id: string | undefined, resume = false) {
  const jotaiStore = useStore();
  const sendMessage = useCallback<SendMessage>(
    (message, options) => ask(toAskProps(message), options),
    [ask],
  );
  const resumeStream = useCallback(async () => {
    if (!id || id === Constants.NEW_CONVO) {
      return;
    }
    jotaiStore.set(resumeRequestsAtom, (pending) =>
      pending.has(id) ? pending : new Set(pending).add(id),
    );
  }, [id, jotaiStore]);
  useEffect(() => {
    if (resume) {
      void resumeStream();
    }
  }, [resume, resumeStream]);
  return { sendMessage, resumeStream };
}

/**
 * `useChat` without `messages`, for controls that submit or read status: it re-renders when the
 * status changes, not on every stream frame, and never maps the conversation.
 */
export function useChatActions(): ChatActions {
  const contract = useChatContext();
  const {
    conversation,
    getMessages,
    messagesKey,
    latestMessageId,
    isSubmitting,
    ask,
    regenerate: regenerateTarget,
    stopGenerating,
  } = contract;
  const { subscribe } = useChatState(contract);
  const status = useSnapshot(subscribe, () =>
    readStatus(isSubmitting, findLatest(getMessages(), latestMessageId)),
  );
  const regenerate = useRegenerate(getMessages, latestMessageId, regenerateTarget);
  const id = messagesKey || conversation?.conversationId || undefined;
  const { sendMessage, resumeStream } = useTurnActions(ask, id);

  return useMemo(
    () => ({ id, status, sendMessage, regenerate, stop: stopGenerating, resumeStream }),
    [id, status, sendMessage, regenerate, stopGenerating, resumeStream],
  );
}

const increment = (count: number) => count + 1;

/**
 * AI SDK `useChat`, read and called through `ChatContext`. It holds no state of its own:
 * `messages` is `getMessages()` mapped per message, re-read when the message query cache is
 * written, and every action forwards to the contract.
 */
function useContractChat({ throttle, resume }: UseChatOptions): UseChatHelpers {
  const contract = useChatContext();
  const {
    conversation,
    getMessages,
    useLiveAttachments,
    latestMessageId,
    isSubmitting,
    ask,
    regenerate: regenerateTarget,
    stopGenerating,
  } = contract;
  const liveAttachments = useLiveAttachments();
  const { state, subscribe } = useChatState(contract);
  const [, render] = useReducer(increment, 0);

  const snapshot = useRef<{ writes: number; stored?: TMessage[] }>();
  /**
   * A stream frame replaces a response's content on the same object, so structural sharing can
   * keep the cached array. Every write still counts on the query, so the snapshot is keyed by that
   * store-owned count and by the array; a write that lands before the listener subscribes is
   * still seen.
   */
  const readSnapshot = useCallback(() => {
    const stored = getMessages();
    const writes = state.version;
    const current = snapshot.current;
    if (current?.writes === writes && current.stored === stored) {
      return current;
    }
    snapshot.current = { writes, stored };
    return snapshot.current;
  }, [getMessages, state]);
  const cache = useSnapshot(subscribe, readSnapshot, { throttle });

  const { messages, latest } = useMemo(() => {
    const list: UIMessage[] = [];
    let latestMessage: TMessage | undefined;
    for (const message of cache.stored ?? []) {
      list.push(toView(message, liveAttachments[message.messageId], viewOptions));
      if (message.messageId === latestMessageId) {
        latestMessage = message;
      }
    }
    return { messages: list, latest: latestMessage };
  }, [cache, latestMessageId, liveAttachments]);

  const chatId = contract.messagesKey || conversation?.conversationId || undefined;
  const status = readStatus(isSubmitting, latest);
  const errorText = status === 'error' && latest ? getErrorText(latest) : undefined;
  const error = useMemo(
    () => (errorText === undefined ? undefined : new Error(errorText)),
    [errorText],
  );

  const regenerate = useRegenerate(getMessages, latestMessageId, regenerateTarget);
  const { sendMessage, resumeStream } = useTurnActions(ask, chatId, resume);

  const clearError = useCallback(() => {
    if (status !== 'error' || !latest) {
      return;
    }
    clearedErrors.add(latest);
    render();
  }, [latest, status]);

  const setMessages = useCallback(
    (update: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => {
      const current = getMessages() ?? [];
      const next =
        typeof update === 'function'
          ? update(
              current.map((message) =>
                toView(message, liveAttachments[message.messageId], viewOptions),
              ),
            )
          : update;
      state.replaceMessages(toStoredMessages(next, current, { chatId, latestMessageId }));
    },
    [chatId, getMessages, latestMessageId, liveAttachments, state],
  );

  return {
    id: chatId,
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop: stopGenerating,
    resumeStream,
    clearError,
    setMessages,
  };
}

type ChatOptions = UseChatOptions & { chat?: Chat };

const useChatOnCore = ({ chat, throttle, resume }: ChatOptions): CoreChatHelpers => {
  if (!chat) {
    throw new Error('useChat lost its `chat` after mount; key the component on the chat instead');
  }
  return useCoreChat({ chat, throttle, resume, view: viewOptions });
};

/**
 * AI SDK `useChat`. With a core `Chat` it returns that chat's helpers, mapped with the client's
 * tool rules; without one it reads and calls the pane's chat contract. Whether a `chat` is passed
 * is read once, on mount: a component that switches between the two remounts (key it on the chat).
 */
export function useChat(options: UseCoreChatOptions): CoreChatHelpers;
export function useChat(options?: UseChatOptions): UseChatHelpers;
export function useChat(options: ChatOptions = {}): UseChatHelpers | CoreChatHelpers {
  const [useImplementation] = useState<(o: ChatOptions) => UseChatHelpers | CoreChatHelpers>(() =>
    options.chat ? useChatOnCore : useContractChat,
  );
  return useImplementation(options);
}
