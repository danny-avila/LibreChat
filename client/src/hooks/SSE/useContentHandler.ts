import type { SetterOrUpdater } from 'recoil';
import type { TSubmission, TMessage, TConversation, TContentData } from 'librechat-data-provider';
type TUseContentHandler = {
  setMessages: (messages: TMessage[]) => void;
  setConversation: SetterOrUpdater<TConversation>;
};
type TContentHandler = {
  data: TContentData;
  submission: TSubmission;
};

export default function useContentHandler({ setMessages, setConversation }: TUseContentHandler) {
  const messageMap = new Map<string, TMessage>();
  return ({ data, submission }: TContentHandler) => {
    const { type, messageId, index } = data;
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
        submitting: true,
        messageId,
        content: [],
      };
      messageMap.set(messageId, response);
    }

    const part = data[type];
    response.content = response.content || [];
    response.content[index] = part;
    response.content = response.content.filter((p) => p !== undefined);

    setMessages([...messages, userMessage, response]);
  };
}
