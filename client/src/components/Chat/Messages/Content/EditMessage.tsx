import { useRecoilState, useRecoilValue } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import { useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { TextareaAutosize } from '~/components/ui';
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

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const { conversationId, parentMessageId, messageId } = message;
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');
  const localize = useLocalize();

  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const isRTL = chatDirection === 'rtl';

  const { register, handleSubmit, setValue } = useForm({
    defaultValues: {
      text: text ?? '',
    },
  });

  useEffect(() => {
    const textArea = textAreaRef.current;
    if (textArea) {
      const length = textArea.value.length;
      textArea.focus();
      textArea.setSelectionRange(length, length);
    }
  }, []);

  const resubmitMessage = (data: { text: string }) => {
    if (message.isCreatedByUser) {
      ask(
        {
          text: data.text,
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
          editedText: data.text,
          editedMessageId: messageId,
          isRegenerate: true,
          isEdited: true,
        },
      );

      setSiblingIdx((siblingIdx ?? 0) - 1);
    }

    enterEdit(true);
  };

  const updateMessage = (data: { text: string }) => {
    const messages = getMessages();
    if (!messages) {
      return;
    }
    updateMessageMutation.mutate({
      conversationId: conversationId ?? '',
      model: conversation?.model ?? 'gpt-3.5-turbo',
      text: data.text,
      messageId,
    });

    if (message.messageId === latestMultiMessage?.messageId) {
      setLatestMultiMessage({ ...latestMultiMessage, text: data.text });
    }

    const isInMessages = messages.some((message) => message.messageId === messageId);
    if (!isInMessages) {
      message.text = data.text;
    } else {
      setMessages(
        messages.map((msg) =>
          msg.messageId === messageId
            ? {
              ...msg,
              text: data.text,
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

  const { ref, ...registerProps } = register('text', {
    required: true,
    onChange: (e) => {
      setValue('text', e.target.value, { shouldValidate: true });
    },
  });

  return (
    <Container message={message}>
      <div className="bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border border-border-medium text-text-primary [&:has(textarea:focus)]:border-border-heavy [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
        <TextareaAutosize
          {...registerProps}
          ref={(e) => {
            ref(e);
            textAreaRef.current = e;
          }}
          onKeyDown={handleKeyDown}
          data-testid="message-text-editor"
          className={cn(
            'markdown prose dark:prose-invert light whitespace-pre-wrap break-words pl-3 md:pl-4',
            'm-0 w-full resize-none border-0 bg-transparent py-[10px]',
            'placeholder-text-secondary focus:ring-0 focus-visible:ring-0 md:py-3.5',
            isRTL ? 'text-right' : 'text-left',
            'max-h-[65vh] pr-3 md:max-h-[75vh] md:pr-4',
            removeFocusRings,
          )}
          dir={isRTL ? 'rtl' : 'ltr'}
        />
      </div>
      <div className="mt-2 flex w-full justify-center text-center">
        <button
          className="btn btn-primary relative mr-2"
          disabled={
            isSubmitting || (endpoint === EModelEndpoint.google && !message.isCreatedByUser)
          }
          onClick={handleSubmit(resubmitMessage)}
        >
          {localize('com_ui_save_submit')}
        </button>
        <button
          className="btn btn-secondary relative mr-2"
          disabled={isSubmitting}
          onClick={handleSubmit(updateMessage)}
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
