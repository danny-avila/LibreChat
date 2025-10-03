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
  return useCallback(
    ({ data, submission }: TContentHandler) => {
      const { type, messageId, thread_id, conversationId, index } = data;

      const _messages = getMessages();
      const messages =
        _messages?.filter((m) => m.messageId !== messageId).map((msg) => ({ ...msg, thread_id })) ??
        [];
      const userMessage = messages[messages.length - 1] as TMessage | undefined;

      const { initialResponse } = submission;

      let response = messageMap.get(messageId);
      if (!response) {
        response = {
          ...(initialResponse as TMessage),
          parentMessageId: userMessage?.messageId ?? '',
          conversationId,
          messageId,
          thread_id,
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

      if (
        type !== ContentTypes.TEXT &&
        initialResponse.content &&
        ((response.content[response.content.length - 1].type === ContentTypes.TOOL_CALL &&
          response.content[response.content.length - 1][ContentTypes.TOOL_CALL].progress === 1) ||
          response.content[response.content.length - 1].type === ContentTypes.IMAGE_FILE)
      ) {
        response.content.push(initialResponse.content[0]);
      }

      setMessages([...messages, response]);
    },
    [queryClient, getMessages, messageMap, setMessages],
  );
}
