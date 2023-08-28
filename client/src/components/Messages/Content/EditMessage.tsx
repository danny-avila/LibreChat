import { useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useUpdateMessageMutation } from 'librechat-data-provider';
import type { TEditProps } from '~/common';
import store from '~/store';
import Container from './Container';

const EditMessage = ({
  text,
  message,
  isSubmitting,
  ask,
  enterEdit,
  siblingIdx,
  setSiblingIdx,
}: TEditProps) => {
  const [messages, setMessages] = useRecoilState(store.messages);
  const textEditor = useRef<HTMLDivElement | null>(null);
  const { conversationId, parentMessageId, messageId } = message;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');

  const resubmitMessage = () => {
    const text = textEditor?.current?.innerText ?? '';
    if (message.isCreatedByUser) {
      ask({
        text,
        parentMessageId,
        conversationId,
      });

      setSiblingIdx((siblingIdx ?? 0) - 1);
    } else {
      const parentMessage = messages?.find((msg) => msg.messageId === parentMessageId);

      if (!parentMessage) {
        return;
      }
      ask(
        { ...parentMessage },
        {
          editedText: text,
          editedMessageId: messageId,
          isRegenerate: true,
          isEdited: true,
        },
      );

      setSiblingIdx((siblingIdx ?? 0) - 1);
    }

    enterEdit(true);
  };

  const updateMessage = () => {
    if (!messages) {
      return;
    }
    const text = textEditor?.current?.innerText ?? '';
    updateMessageMutation.mutate({
      conversationId: conversationId ?? '',
      messageId,
      text,
    });
    setMessages(() =>
      messages.map((msg) =>
        msg.messageId === messageId
          ? {
            ...msg,
            text,
          }
          : msg,
      ),
    );
    enterEdit(true);
  };

  return (
    <Container>
      <div
        data-testid="message-text-editor"
        className="markdown prose dark:prose-invert light w-full whitespace-pre-wrap break-words border-none focus:outline-none"
        contentEditable={true}
        ref={textEditor}
        suppressContentEditableWarning={true}
      >
        {text}
      </div>
      <div className="mt-2 flex w-full justify-center text-center">
        <button
          className="btn btn-primary relative mr-2"
          disabled={isSubmitting}
          onClick={resubmitMessage}
        >
          Save & Submit
        </button>
        <button
          className="btn btn-secondary relative mr-2"
          disabled={isSubmitting}
          onClick={updateMessage}
        >
          Save
        </button>
        <button className="btn btn-neutral relative" onClick={() => enterEdit(true)}>
          Cancel
        </button>
      </div>
    </Container>
  );
};

export default EditMessage;
