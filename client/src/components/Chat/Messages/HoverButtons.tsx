import React, { useState } from 'react';
import { useRecoilState } from 'recoil';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { EditIcon, Clipboard, CheckMark, ContinueIcon, RegenerateIcon } from '~/components/svg';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { Fork } from '~/components/Conversations';
import MessageAudio from './MessageAudio';
import { cn } from '~/utils';
import store from '~/store';

type THoverButtons = {
  isEditing: boolean;
  enterEdit: (cancel?: boolean) => void;
  copyToClipboard: (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => void;
  conversation: TConversation | null;
  isSubmitting: boolean;
  message: TMessage;
  regenerate: () => void;
  handleContinue: (e: React.MouseEvent<HTMLButtonElement>) => void;
  latestMessage: TMessage | null;
  isLast: boolean;
  setIsForking: (isForking: boolean) => void;
  flat?: boolean;
  index: number;
};

export default function HoverButtons({
  index,
  isEditing,
  enterEdit,
  copyToClipboard,
  conversation,
  isSubmitting,
  message,
  regenerate,
  handleContinue,
  latestMessage,
  isLast,
  setIsForking,
  flat,
}: THoverButtons) {
  const localize = useLocalize();
  const { endpoint: _endpoint, endpointType } = conversation ?? {};
  const endpoint = endpointType ?? _endpoint;
  const [isCopied, setIsCopied] = useState(false);
  const [TextToSpeech] = useRecoilState<boolean>(store.TextToSpeech);

  const {
    hideEditButton,
    regenerateEnabled,
    continueSupported,
    forkingSupported,
    isEditableEndpoint,
  } = useGenerationsByLatest({
    isEditing,
    isSubmitting,
    message,
    endpoint: endpoint ?? '',
    latestMessage,
  });
  if (!conversation) {
    return null;
  }

  const { isCreatedByUser } = message;

  const onEdit = () => {
    if (isEditing) {
      return enterEdit(true);
    }
    enterEdit();
  };

  return (
    <div className="visible mt-0 flex justify-center gap-1 self-end text-gray-400 lg:justify-start">
      {TextToSpeech && (
        <MessageAudio
          index={index}
          message={message}
          isLast={isLast}
          className={flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : ''}
        />
      )}
      {isEditableEndpoint && (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
            flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : '',
            hideEditButton ? 'hidden' : '',
            isEditing ? 'active bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : '',
          )}
          onClick={onEdit}
          type="button"
          title={localize('com_ui_edit')}
          disabled={hideEditButton}
        >
          <EditIcon size="19" />
        </button>
      )}
      <button
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',

          flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : '',
          isSubmitting && (!flat || isCreatedByUser)
            ? 'md:opacity-0 md:group-hover:opacity-100'
            : '',
        )}
        onClick={() => copyToClipboard(setIsCopied)}
        type="button"
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
      >
        {isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
      </button>
      {regenerateEnabled ? (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',

            flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : '',
          )}
          onClick={regenerate}
          type="button"
          title={localize('com_ui_regenerate')}
        >
          <RegenerateIcon
            className="hover:text-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"
            size="19"
          />
        </button>
      ) : null}
      <Fork
        isLast={isLast}
        setIsForking={setIsForking}
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessage={latestMessage}
        className={flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : ''}
      />
      {continueSupported ? (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
            flat || !isCreatedByUser ? 'active h-7 w-7 rounded-md' : '',
          )}
          onClick={handleContinue}
          type="button"
          title={localize('com_ui_continue')}
        >
          <ContinueIcon className="h-4 w-4 hover:text-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
    </div>
  );
}
