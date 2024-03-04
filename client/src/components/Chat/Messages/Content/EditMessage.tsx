import { useRef } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import Container from '~/components/Messages/Content/Container';
import { useChatContext } from '~/Providers';
import type { TEditProps } from '~/common';
import { useLocalize } from '~/hooks';

const EditMessage = ({
  text,
  message,
  isSubmitting,
  ask,
  enterEdit,
  siblingIdx,
  setSiblingIdx,
}: TEditProps) => {
  const { getMessages, setMessages, conversation } = useChatContext();

  const textEditor = useRef<HTMLDivElement | null>(null);
  const { conversationId, parentMessageId, messageId } = message;
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');
  const localize = useLocalize();

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
      const messages = getMessages();
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
    const messages = getMessages();
    if (!messages) {
      return;
    }
    const text = textEditor?.current?.innerText ?? '';
    updateMessageMutation.mutate({
      conversationId: conversationId ?? '',
      model: conversation?.model ?? 'gpt-3.5-turbo',
      messageId,
      text,
    });
    setMessages(
      messages.map((msg) =>
        msg.messageId === messageId
          ? {
            ...msg,
            text,
            isEdited: true,
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
          disabled={
            isSubmitting || (endpoint === EModelEndpoint.google && !message.isCreatedByUser)
          }
          onClick={resubmitMessage}
        >
          {localize('com_ui_save_submit')}
        </button>
        <button
          className="btn btn-secondary relative mr-2"
          disabled={isSubmitting}
          onClick={updateMessage}
        >
          {localize('com_ui_save')}
        </button>
        <button className="btn btn-neutral relative" onClick={() => enterEdit(true)}>
          {localize('com_ui_cancel')}
        </button>
      </div>
    </Container>
  );
};

export default EditMessage;
