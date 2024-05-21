import TextareaAutosize from 'react-textarea-autosize';
import { EModelEndpoint } from 'librechat-data-provider';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import { cn, removeFocusOutlines } from '~/utils';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import Container from './Container';
import { useRecoilState } from 'recoil';
import store from '~/store';

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
  const [messagesUI, setMessagesUI] = useRecoilState<boolean>(store.messagesUI);
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
      ask(
        {
          text: editedText,
          parentMessageId,
          conversationId,
        },
        {
          resubmitFiles: true,
        },
      );

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        enterEdit(true);
      }
    },
    [enterEdit],
  );

  return (
    <Container
      message={message}
      className={cn({
        'rounded-3xl bg-gray-100 px-3 py-3 dark:bg-gray-600': messagesUI,
      })}
    >
      <TextareaAutosize
        ref={textAreaRef}
        onChange={(e) => {
          setEditedText(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        data-testid="message-text-editor"
        className={cn(
          'markdown prose dark:prose-invert light whitespace-pre-wrap break-words dark:text-gray-20',
          'm-0 w-full resize-none border-0 bg-transparent p-0 p-2',
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
      <div
        className={cn('mt-2 flex w-full items-center justify-center text-center', {
          'justify-end': messagesUI,
        })}
      >
        <button
          className={cn('relative mr-2', {
            'btn btn-primary': messagesUI,
            'inline-flex items-center rounded-md bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-500/80 dark:hover:bg-green-500/60':
              !messagesUI,
          })}
          disabled={
            isSubmitting || (endpoint === EModelEndpoint.google && !message.isCreatedByUser)
          }
          onClick={resubmitMessage}
        >
          {localize('com_ui_save_submit')}
        </button>
        {/* btn-secondary has off styles */}
        <button
          className={cn('relative mr-2', {
            'btn btn-primary': messagesUI,
            'inline-flex items-center rounded-md bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-500/80 dark:hover:bg-green-500/60':
              !messagesUI,
          })}
          disabled={isSubmitting}
          onClick={updateMessage}
        >
          {localize('com_ui_save')}
        </button>
        <button
          className={cn('relative', {
            'btn btn-neutral dark:bg-white dark:text-black dark:hover:bg-white/80': messagesUI,
            'inline-flex items-center rounded-md border bg-transparent px-3 py-2 text-sm font-medium text-black hover:bg-gray-100 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600':
              !messagesUI,
          })}
          onClick={() => enterEdit(true)}
        >
          {localize('com_ui_cancel')}
        </button>
      </div>
    </Container>
  );
};

export default EditMessage;
