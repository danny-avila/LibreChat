import { useRef, useEffect, useCallback, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Alert, Button, TextareaAutosize } from '@librechat/client';
import { useUpdateMessageMutation } from 'librechat-data-provider/react-query';
import type { TEditProps } from '~/common';
import { useMessagesOperations, useMessagesConversation } from '~/Providers';
import { useGetAddedConvo } from '~/hooks/Chat';
import { useLocalize } from '~/hooks';
import Container from './Container';
import { cn } from '~/utils';
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
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [saveError, setSaveError] = useState(false);
  const { conversation } = useMessagesConversation();
  const { getMessages, setMessages } = useMessagesOperations();

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const { conversationId, parentMessageId, messageId } = message;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');
  const localize = useLocalize();

  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const isRTL = chatDirection === 'rtl';

  const getAddedConvo = useGetAddedConvo();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty, isValid },
  } = useForm({
    mode: 'onChange',
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

  /** `ask` refuses to send while another response is streaming and reports it by
   *  returning false. Closing the editor regardless would throw the draft away for
   *  a rerun that never started, so a refused send leaves the editor as it was. */
  const resubmitMessage = (data: { text: string }) => {
    if (message.isCreatedByUser) {
      const submitted = ask(
        {
          text: data.text,
          parentMessageId,
          conversationId,
        },
        {
          overrideFiles: message.files,
          /** Pills on the edited user message stay visible after save-and-submit;
           *  carry the picks forward so the new turn primes the same skills
           *  instead of running unprimed. */
          overrideManualSkills: message.manualSkills,
          /** Carry the edited user message's quoted excerpts forward so the new
           *  turn sends the same referenced context the pills still show. */
          overrideQuotes: message.quotes,
          addedConvo: getAddedConvo() || undefined,
        },
      );

      if (submitted === false) {
        return;
      }

      setSiblingIdx((siblingIdx ?? 0) - 1);
    } else {
      const messages = getMessages();
      const parentMessage = messages?.find((msg) => msg.messageId === parentMessageId);

      if (!parentMessage) {
        return;
      }
      const submitted = ask(
        { ...parentMessage },
        {
          editedText: data.text,
          editedMessageId: messageId,
          isRegenerate: true,
          isEdited: true,
          /** Edit-assistant-response flow replays the parent user turn; keep
           *  the same manual skills so the regenerated response is primed
           *  identically. */
          overrideManualSkills: parentMessage.manualSkills,
          /** Replaying the parent user turn: keep its quoted excerpts so the
           *  regenerated response is sent the same referenced context. */
          overrideQuotes: parentMessage.quotes,
          addedConvo: getAddedConvo() || undefined,
        },
      );

      if (submitted === false) {
        return;
      }

      setSiblingIdx((siblingIdx ?? 0) - 1);
    }

    enterEdit(true);
  };

  const updateMessage = async (data: { text: string }) => {
    setSaveError(false);
    try {
      await updateMessageMutation.mutateAsync({
        conversationId: conversationId ?? '',
        model: conversation?.model ?? 'gpt-3.5-turbo',
        text: data.text,
        messageId,
      });

      /** Read the thread after the request, not before it. An earlier turn stays
       *  editable while the newest answer streams, so a snapshot taken before the
       *  round trip is already behind by the time it would be written back, and
       *  writing it wholesale would drop every delta that landed in between. */
      const messages = getMessages();
      if (!messages) {
        enterEdit(true);
        return;
      }

      const isInMessages = messages.some(
        (currentMessage) => currentMessage.messageId === messageId,
      );
      if (!isInMessages) {
        message.text = data.text;
      } else {
        setMessages(
          messages.map((msg) =>
            msg.messageId === messageId
              ? {
                  ...msg,
                  text: data.text,
                }
              : msg,
          ),
        );
      }

      enterEdit(true);
    } catch {
      setSaveError(true);
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitButtonRef.current?.click();
      }
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveButtonRef.current?.click();
      }
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
      setValue('text', e.target.value, { shouldDirty: true, shouldValidate: true });
    },
  });

  return (
    <Container message={message}>
      <section
        aria-label={localize('com_ui_edit_message')}
        className="mt-2 flex w-full flex-col gap-2"
      >
        {saveError && <Alert variant="error">{localize('com_ui_save_message_error')}</Alert>}
        <TextareaAutosize
          {...registerProps}
          ref={(e) => {
            ref(e);
            textAreaRef.current = e;
          }}
          onKeyDown={handleKeyDown}
          data-testid="message-text-editor"
          className={cn(
            'message-editor-text max-h-[65vh] min-h-24 w-full resize-y whitespace-pre-wrap',
            'break-words rounded-lg border border-border-medium bg-surface-tertiary-alt',
            'px-3 py-2 text-text-primary',
            'focus-visible:outline-none',
            isRTL ? 'text-right' : 'text-left',
            'disabled:opacity-50 md:max-h-[75vh]',
          )}
          aria-label={localize('com_ui_message_input')}
          aria-keyshortcuts="Control+Enter Meta+Enter Control+S Meta+S Escape"
          disabled={isSubmitting || updateMessageMutation.isLoading}
          dir={isRTL ? 'rtl' : 'ltr'}
        />
        {/* The actions wrap rather than hold one unbreakable row: on a 320px assistant
            turn the identity column and page padding leave less width than the three
            English labels need, and a translated label needs more still. */}
        <footer className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="line-clamp-2 min-w-0 flex-1 text-xs text-text-secondary"
            aria-live="polite"
          >
            {isDirty ? localize('com_ui_unsaved_changes') : ''}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => enterEdit(true)}
              disabled={updateMessageMutation.isLoading}
            >
              {localize('com_ui_cancel')}
            </Button>
            <Button
              ref={saveButtonRef}
              size="sm"
              variant="outline"
              disabled={isSubmitting || updateMessageMutation.isLoading || !isDirty || !isValid}
              onClick={handleSubmit(updateMessage)}
            >
              {updateMessageMutation.isLoading
                ? localize('com_ui_saving')
                : localize('com_ui_save')}
            </Button>
            <Button
              ref={submitButtonRef}
              size="sm"
              variant="submit"
              disabled={isSubmitting || updateMessageMutation.isLoading || !isDirty || !isValid}
              onClick={handleSubmit(resubmitMessage)}
            >
              {localize('com_ui_update_rerun')}
            </Button>
          </div>
        </footer>
      </section>
    </Container>
  );
};

export default EditMessage;
