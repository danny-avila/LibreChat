import { useEffect } from 'react';
import store from '~/store';
import TrashIcon from '../svg/TrashIcon';
import { Dialog, DialogTrigger } from '../ui/Dialog.tsx';
import DialogTemplate from '../ui/DialogTemplate';
import { useClearConversationsMutation } from '~/data-provider';

export default function ClearConvos() {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();

  const clickHandler = () => {
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
      <DialogTrigger asChild>
        <a
          className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
          // onClick={clickHandler}
        >
          <TrashIcon />
          Clear conversations
        </a>
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
