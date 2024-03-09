import { useState } from 'react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { Clipboard, CheckMark, EditIcon, RegenerateIcon, ContinueIcon } from '~/components/svg';
import { useGenerations, useLocalize } from '~/hooks';
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
}: THoverButtons) {
  const localize = useLocalize();
  const { endpoint } = conversation ?? {};
  const [isCopied, setIsCopied] = useState(false);
  const { hideEditButton, regenerateEnabled, continueSupported } = useGenerations({
    isEditing,
    isSubmitting,
    message,
    endpoint: endpoint ?? '',
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
    <div className="visible mt-2 flex justify-center gap-3 self-end text-gray-400 md:gap-4 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:translate-x-full lg:gap-1 lg:self-center lg:pl-2">
      <button
        className={cn(
          'hover-button rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
          isCreatedByUser ? '' : 'active',
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
      <button
        className={cn(
          'hover-button rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
          isCreatedByUser ? '' : 'active',
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
          className="hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible"
          onClick={regenerate}
          type="button"
          title={localize('com_ui_regenerate')}
        >
          <RegenerateIcon className="hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
      {continueSupported ? (
        <button
          className="hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible "
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
