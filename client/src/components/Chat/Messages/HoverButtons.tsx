import { useState } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { Clipboard, CheckMark, EditIcon, RegenerateIcon, ContinueIcon } from '~/components/svg';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { Fork } from '~/components/Conversations';
import { cn } from '~/utils';

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
};

export default function HoverButtons({
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
  const { hideEditButton, regenerateEnabled, continueSupported, forkingSupported } =
    useGenerationsByLatest({
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
      {endpoint !== EModelEndpoint.assistants && (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
            'md:opacity-0 md:group-hover:opacity-100',
            isCreatedByUser ? '' : 'active h-7 w-7 rounded-md',
            hideEditButton ? 'opacity-0' : '',
            isEditing ? 'active bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : '',
          )}
          onClick={onEdit}
          type="button"
          title={localize('com_ui_edit')}
          disabled={hideEditButton}
        >
          <EditIcon />
        </button>
      )}
      <button
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
          'md:opacity-0 md:group-hover:opacity-100',
          isCreatedByUser ? '' : 'active h-7 w-7 rounded-md',
          isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : '',
        )}
        onClick={() => copyToClipboard(setIsCopied)}
        type="button"
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
      >
        {isCopied ? <CheckMark /> : <Clipboard />}
      </button>
      {regenerateEnabled ? (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
            'md:opacity-0 md:group-hover:opacity-100',
            isCreatedByUser ? '' : 'active h-7 w-7 rounded-md',
          )}
          onClick={regenerate}
          type="button"
          title={localize('com_ui_regenerate')}
        >
          <RegenerateIcon className="hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
      <Fork
        isLast={isLast}
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessage={latestMessage}
        className={isCreatedByUser ? '' : 'active h-7 w-7 rounded-md'}
      />
      {continueSupported ? (
        <button
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-200 hover:text-gray-700 dark:text-gray-100/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400',
            'md:opacity-0 md:group-hover:opacity-100',
            isCreatedByUser ? '' : 'active h-7 w-7 rounded-md',
          )}
          onClick={handleContinue}
          type="button"
          title={localize('com_ui_continue')}
        >
          <ContinueIcon className="h-4 w-4 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
    </div>
  );
}
