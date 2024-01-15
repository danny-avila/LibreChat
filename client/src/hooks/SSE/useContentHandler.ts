import { ContentTypes } from 'librechat-data-provider';
import type {
  TSubmission,
  TMessage,
  TContentData,
  ContentPart,
  TMessageContent,
} from 'librechat-data-provider';

type TUseContentHandler = {
  setMessages: (messages: TMessage[]) => void;
  getMessages: () => TMessage[] | undefined;
};

type TContentHandler = {
  data: TContentData;
  submission: TSubmission;
};

export default function useContentHandler({ setMessages, getMessages }: TUseContentHandler) {
  const messageMap = new Map<string, TMessage>();
  return ({ data, submission }: TContentHandler) => {
    const { type, messageId, thread_id, index, stream } = data;

    const _messages = getMessages();
    const messages =
      _messages?.filter((m) => m.messageId !== messageId)?.map((msg) => ({ ...msg, thread_id })) ??
      [];
    const userMessage = messages[messages.length - 1];

    const { initialResponse } = submission;

    let response = messageMap.get(messageId);
    if (!response) {
      response = {
        ...initialResponse,
        parentMessageId: userMessage?.messageId,
        messageId,
        thread_id,
        content: [],
      };
      messageMap.set(messageId, response);
    }

    // TODO: handle streaming for non-text
    const part: ContentPart =
      stream && data[ContentTypes.TEXT] ? { value: data[ContentTypes.TEXT] } : data[type];

    /* spreading the content array to avoid mutation */
    response.content = [...(response.content ?? [])];

    response.content[index] = { type, [type]: part } as TMessageContent;

    response.content = response.content.filter((p) => p !== undefined);

    setMessages([...messages, response]);
  };
}
