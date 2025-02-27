import { useForm } from 'react-hook-form';
import { ContentTypes } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useUpdateMessageContentMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import Container from '~/components/Chat/Messages/Content/Container';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { TextareaAutosize } from '~/components/ui';
import { cn, removeFocusRings } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

const EditTextPart = ({
  text,
  index,
  messageId,
  isSubmitting,
  enterEdit,
}: Omit<TEditProps, 'message' | 'ask'> & {
  index: number;
  messageId: string;
}) => {
  const localize = useLocalize();
  const { addedIndex } = useAddedChatContext();
  const { getMessages, setMessages, conversation } = useChatContext();
  const [latestMultiMessage, setLatestMultiMessage] = useRecoilState(
    store.latestMessageFamily(addedIndex),
  );

  const { conversationId = '' } = conversation ?? {};
  const message = useMemo(
    () => getMessages()?.find((msg) => msg.messageId === messageId),
    [getMessages, messageId],
  );

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const updateMessageContentMutation = useUpdateMessageContentMutation(conversationId ?? '');

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

  /*
  const resubmitMessage = () => {
    showToast({
      status: 'warning',
      message: localize('com_warning_resubmit_unsupported'),
    });

    // const resubmitMessage = (data: { text: string }) => {
    // Not supported by AWS Bedrock
    const messages = getMessages();
    const parentMessage = messages?.find((msg) => msg.messageId === message?.parentMessageId);

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
    enterEdit(true);
  };
  */

  const updateMessage = (data: { text: string }) => {
    const messages = getMessages();
    if (!messages) {
      return;
    }
    updateMessageContentMutation.mutate({
      index,
      conversationId: conversationId ?? '',
      text: data.text,
      messageId,
    });

    if (messageId === latestMultiMessage?.messageId) {
      setLatestMultiMessage({ ...latestMultiMessage, text: data.text });
    }

    const isInMessages = messages.some((msg) => msg.messageId === messageId);
    if (!isInMessages) {
      return enterEdit(true);
    }

    const updatedContent = message?.content?.map((part, idx) => {
      if (part.type === ContentTypes.TEXT && idx === index) {
        return { ...part, text: data.text };
      }
      return part;
    });

    setMessages(
      messages.map((msg) =>
        msg.messageId === messageId
          ? {
            ...msg,
            content: updatedContent,
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

  const { ref, ...registerProps } = register('text', {
    required: true,
    onChange: (e) => {
      setValue('text', e.target.value, { shouldValidate: true });
    },
  });

  return (
    <Container message={message}>
      <div className="bg-token-main-surface-primary relative flex w-full grow flex-col overflow-hidden rounded-2xl border border-border-medium text-text-primary [&:has(textarea:focus)]:border-border-heavy [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
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
        {/* <button
          className="btn btn-primary relative mr-2"
          disabled={isSubmitting}
          onClick={handleSubmit(resubmitMessage)}
        >
          {localize('com_ui_save_submit')}
        </button> */}
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

export default EditTextPart;
