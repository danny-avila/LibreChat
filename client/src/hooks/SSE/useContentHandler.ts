import { useCallback, useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';

import type {
  Text,
  TMessage,
  ImageFile,
  ContentPart,
  PartMetadata,
  TContentData,
  EventSubmission,
  TMessageContentParts,
} from 'librechat-data-provider';
import { addFileToCache } from '~/utils';

type TUseContentHandler = {
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
};

type TContentHandler = {
  data: TContentData;
  submission: EventSubmission;
};

export default function useContentHandler({ setMessages, getMessages }: TUseContentHandler) {
  const queryClient = useQueryClient();
  const messageMap = useMemo(() => new Map<string, TMessage>(), []);

  /** Reset the message map - call this after sync to prevent stale state from overwriting synced content */
  const resetMessageMap = useCallback(() => {
    messageMap.clear();
  }, [messageMap]);

  const handler = useCallback(
    ({ data, submission }: TContentHandler) => {
      const { type, messageId, thread_id, conversationId, index } = data;
      const { initialResponse } = submission;
      const initialResponseMessage = initialResponse as TMessage;
      const cachedResponse = messageMap.get(messageId);

      const _messages = getMessages() ?? [];
      const messages: TMessage[] = [];
      let existingMessage: TMessage | undefined;
      let responseThreadId: string | undefined =
        thread_id ?? cachedResponse?.thread_id ?? initialResponseMessage.thread_id;
      for (const msg of _messages) {
        if (msg.messageId === messageId) {
          existingMessage ??= msg;
          responseThreadId ??= msg.thread_id;
          continue;
        }
        messages.push(
          thread_id == null || msg.thread_id === thread_id ? msg : { ...msg, thread_id },
        );
      }
      if (thread_id == null && responseThreadId != null) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].thread_id !== responseThreadId) {
            messages.splice(i, 1);
          }
        }
      }
      const userMessage = messages[messages.length - 1] as TMessage | undefined;

      let response = cachedResponse;
      if (!response) {
        const responseBase = existingMessage ?? initialResponseMessage;
        responseThreadId ??= responseBase.thread_id;
        response = {
          ...responseBase,
          parentMessageId: userMessage?.messageId ?? '',
          conversationId,
          messageId,
          ...(responseThreadId != null ? { thread_id: responseThreadId } : {}),
        };
        messageMap.set(messageId, response);
      }

      // TODO: handle streaming for non-text
      const textPart: Text | string | undefined = data[ContentTypes.TEXT];
      const part: ContentPart =
        textPart != null && typeof textPart === 'string' ? { value: textPart } : data[type];

      if (type === ContentTypes.IMAGE_FILE) {
        addFileToCache(queryClient, part as ImageFile & PartMetadata);
      }

      /* spreading the content array to avoid mutation */
      response.content = [...(response.content ?? [])];

      response.content[index] = { type, [type]: part } as TMessageContentParts;

      const lastContentPart = response.content[response.content.length - 1];
      const initialContentPart = initialResponse.content?.[0];
      if (
        type !== ContentTypes.TEXT &&
        initialContentPart != null &&
        lastContentPart != null &&
        ((lastContentPart.type === ContentTypes.TOOL_CALL &&
          lastContentPart[ContentTypes.TOOL_CALL]?.progress === 1) ||
          lastContentPart.type === ContentTypes.IMAGE_FILE)
      ) {
        response.content.push(initialContentPart);
      }

      setMessages([...messages, response]);
    },
    [queryClient, getMessages, messageMap, setMessages],
  );

  return { contentHandler: handler, resetContentHandler: resetMessageMap };
}
