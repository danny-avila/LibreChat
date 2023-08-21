import { useState } from 'react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { Clipboard, CheckMark, EditIcon, RegenerateIcon, ContinueIcon } from '~/components/svg';
import { useGenerations } from '~/hooks';
import { cn } from '~/utils';

type THoverButtons = {
  isEditing: boolean;
  enterEdit: () => void;
  copyToClipboard: (setIsCopied: (isCopied: boolean) => void) => void;
  conversation: TConversation;
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
  const { endpoint } = conversation;
  const [isCopied, setIsCopied] = useState(false);
  const { editEnabled, regenerateEnabled, continueSupported } = useGenerations({
    isEditing,
    isSubmitting,
    message,
    endpoint: endpoint ?? '',
  });

  return (
    <div className="visible mt-2 flex justify-center gap-3 self-end text-gray-400 md:gap-4 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:translate-x-full lg:gap-1 lg:self-center lg:pl-2">
      <button
        className={cn(
          'hover-button rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
          message?.isCreatedByUser ? '' : 'opacity-0',
        )}
        onClick={enterEdit}
        type="button"
        title="edit"
        disabled={!editEnabled}
      >
        <EditIcon />
      </button>
      <button
        className={cn(
          'hover-button rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
          message?.isCreatedByUser ? '' : 'active',
        )}
        onClick={() => copyToClipboard(setIsCopied)}
        type="button"
        title={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
      >
        {isCopied ? <CheckMark /> : <Clipboard />}
      </button>
      {regenerateEnabled ? (
        <button
          className="hover-button active rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible"
          onClick={regenerate}
          type="button"
          title="regenerate"
        >
          <RegenerateIcon className="hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
      {continueSupported ? (
        <button
          className="hover-button active rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible "
          onClick={handleContinue}
          type="button"
          title="continue"
        >
          <ContinueIcon className="h-4 w-4 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
    </div>
  );
}
