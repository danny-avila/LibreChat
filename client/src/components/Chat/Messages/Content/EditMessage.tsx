import { useState, useRef, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { EModelEndpoint } from 'librechat-data-provider';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import Container from '~/components/Messages/Content/Container';
import { cn, removeFocusOutlines } from '~/utils';
import { useChatContext } from '~/Providers';
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

  const [editedText, setEditedText] = useState<string>(text ?? '');
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const { conversationId, parentMessageId, messageId } = message;
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');
  const localize = useLocalize();

  useEffect(() => {
    const textArea = textAreaRef.current;
    if (textArea) {
      const length = textArea.value.length;
      textArea.focus();
      textArea.setSelectionRange(length, length);
    }
  }, []);

  const resubmitMessage = () => {
    if (message.isCreatedByUser) {
      ask({
        text: editedText,
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
          editedText,
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
    updateMessageMutation.mutate({
      conversationId: conversationId ?? '',
      model: conversation?.model ?? 'gpt-3.5-turbo',
      text: editedText,
      messageId,
    });
    setMessages(
      messages.map((msg) =>
        msg.messageId === messageId
          ? {
            ...msg,
            text: editedText,
            isEdited: true,
          }
          : msg,
      ),
    );
    enterEdit(true);
  };

  return (
    <Container>
      <TextareaAutosize
        ref={textAreaRef}
        onChange={(e) => {
          setEditedText(e.target.value);
        }}
        data-testid="message-text-editor"
        className={cn(
          'markdown prose dark:prose-invert light whitespace-pre-wrap break-words dark:text-gray-20',
          'm-0 w-full resize-none border-0 bg-transparent p-0',
          removeFocusOutlines,
        )}
        onPaste={(e) => {
          e.preventDefault();

          const pastedData = e.clipboardData.getData('text/plain');
          const textArea = textAreaRef.current;
          if (!textArea) {
            return;
          }
          const start = textArea.selectionStart;
          const end = textArea.selectionEnd;
          const newValue =
            textArea.value.substring(0, start) + pastedData + textArea.value.substring(end);
          setEditedText(newValue);
        }}
        contentEditable={true}
        value={editedText}
        suppressContentEditableWarning={true}
      />
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
