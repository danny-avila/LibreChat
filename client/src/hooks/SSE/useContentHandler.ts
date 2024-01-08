import type { SetterOrUpdater } from 'recoil';
import type {
  TSubmission,
  TMessage,
  TConversation,
  TContentData,
  ContentPart,
} from 'librechat-data-provider';
type TUseContentHandler = {
  setMessages: (messages: TMessage[]) => void;
  setConversation: SetterOrUpdater<TConversation | null>;
};
type TContentHandler = {
  data: TContentData;
  submission: TSubmission;
};

export default function useContentHandler({ setMessages }: TUseContentHandler) {
  const messageMap = new Map<string, TMessage>();
  return ({ data, submission }: TContentHandler) => {
    const { type, messageId, thread_id, index, stream } = data;

    const {
      messages,
      message: userMessage,
      initialResponse,
      // isRegenerate = false,
    } = submission;

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
    const part =
      stream && data.text ? ({ value: data.text as unknown as string } as ContentPart) : data[type];
    /* spreading the content array to avoid mutation */
    response.content = [...(response.content ?? [])];
    response.content[index] = part;
    response.content = response.content.filter((p) => p !== undefined);

    setMessages([...messages, { ...userMessage, thread_id }, response]);
  };
}
