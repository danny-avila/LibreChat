import { useRecoilState } from 'recoil';
import TextareaAutosize from 'react-textarea-autosize';
import { EModelEndpoint } from 'librechat-data-provider';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { cn, removeFocusRings } from '~/utils';
import { useLocalize } from '~/hooks';
import Container from './Container';
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
  const { addedIndex } = useAddedChatContext();
  const { getMessages, setMessages, conversation } = useChatContext();
  const [latestMultiMessage, setLatestMultiMessage] = useRecoilState(
    store.latestMessageFamily(addedIndex),
  );

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

    if (message.messageId === latestMultiMessage?.messageId) {
      setLatestMultiMessage({ ...latestMultiMessage, text: editedText });
    }

    const isInMessages = messages?.some((message) => message?.messageId === messageId);
    if (!isInMessages) {
      message.text = editedText;
    } else {
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
    }

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
    <Container message={message}>
      <div className="bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border dark:border-gray-600 dark:text-white [&:has(textarea:focus)]:border-gray-300 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] dark:[&:has(textarea:focus)]:border-gray-500">
        <TextareaAutosize
          ref={textAreaRef}
          onChange={(e) => {
            setEditedText(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          data-testid="message-text-editor"
          className={cn(
            'markdown prose dark:prose-invert light whitespace-pre-wrap break-words',
            'pl-3 md:pl-4',
            'm-0 w-full resize-none border-0 bg-transparent py-[10px]',
            'placeholder-black/50 focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:placeholder-white/50 md:py-3.5  ',
            'pr-3 md:pr-4',
            'max-h-[65vh] md:max-h-[75vh]',
            removeFocusRings,
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
          dir="auto"
        />
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
