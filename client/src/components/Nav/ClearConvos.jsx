import React from 'react';
import store from '~/store';
import TrashIcon from '../svg/TrashIcon';
import { useSWRConfig } from 'swr';
import manualSWR from '~/utils/fetchers';
import { Dialog, DialogTrigger } from '../ui/Dialog.tsx';
import DialogTemplate from '../ui/DialogTemplate';

export default function ClearConvos() {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const { mutate } = useSWRConfig();

  const { trigger } = manualSWR(`/api/convos/clear`, 'post', () => {
    newConversation();
    refreshConversations();
    mutate(`/api/convos`);
  });

  const clickHandler = () => {
    console.log('Clearing conversations...');
    trigger({});
  };

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
