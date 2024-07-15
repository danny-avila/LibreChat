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

  const { isCreatedByUser, error } = message;

  if (error) {
    return null;
  }

  const onEdit = () => {
    if (isEditing) {
      return enterEdit(true);
    }
    enterEdit();
  };

  return (
    <div className="visible mt-0 flex justify-center gap-1 self-end text-gray-400 lg:justify-start">
      {TextToSpeech && <MessageAudio index={index} message={message} isLast={isLast} />}
      {isEditableEndpoint && (
        <button
          className={cn(
            'hover-button rounded-md p-1 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
            isCreatedByUser ? '' : 'active',
            hideEditButton ? 'opacity-0' : '',
            isEditing ? 'active text-gray-700 dark:text-gray-200' : '',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
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
          'ml-0 flex items-center gap-1.5 rounded-md p-1 text-xs hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
          isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : '',
          !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
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
            'hover-button active rounded-md p-1 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible md:group-[.final-completion]:visible',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
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
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessage={latestMessage}
      />
      {continueSupported ? (
        <button
          className={cn(
            'hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible ',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
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
