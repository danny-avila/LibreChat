import { useEffect } from 'react';
import store from '~/store';
import TrashIcon from '../svg/TrashIcon';
import { Dialog, DialogTrigger } from '../ui/Dialog.tsx';
import DialogTemplate from '../ui/DialogTemplate';
import { useClearConversationsMutation } from '~/data-provider';

export default function ClearConvos({ onClick }) {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();

  const clickHandler = e => {
    console.log('Clearing conversations...');
    clearConvosMutation.mutate();
  };

  useEffect(() => {
    if (clearConvosMutation.isSuccess) {
      newConversation();
      refreshConversations();
    }
  }, [clearConvosMutation.isSuccess]);

  return (
    <Dialog>
      <DialogTrigger asChild onClick={onClick}>
        <button
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
        >
          <TrashIcon />
          Clear conversations
        </button>
      </DialogTrigger>
      <DialogTemplate
        title="Clear conversations"
        description="Are you sure you want to clear all conversations? This is irreversible."
        selection={{
          selectHandler: clickHandler,
          selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
          selectText: 'Clear'
        }}
      />
    </Dialog>
  );
}
