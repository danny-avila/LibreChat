import { useEffect } from 'react';
import TrashIcon from '../svg/TrashIcon';
import CrossIcon from '../svg/CrossIcon';
import { useRecoilValue } from 'recoil';
import { useDeleteConversationMutation } from 'librechat-data-provider';
import { Dialog, DialogTrigger } from '~/components/ui/';
import DialogTemplate from '~/components/ui/DialogTemplate';
import store from '~/store';

export default function DeleteButton({ conversationId, renaming, retainView }) {
  const currentConversation = useRecoilValue(store.conversation) || {};
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();

  const confirmDelete = () => {
    deleteConvoMutation.mutate({ conversationId, source: 'button' });
  };

  const deleteConvoMutation = useDeleteConversationMutation(conversationId);

  useEffect(() => {
    if (deleteConvoMutation.isSuccess) {
      if (currentConversation?.conversationId == conversationId) {
        newConversation();
      }

      refreshConversations();
      retainView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteConvoMutation.isSuccess]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-1 hover:text-white">{renaming ? <CrossIcon /> : <TrashIcon />}</button>
      </DialogTrigger>
      <DialogTemplate
        title="Delete conversation"
        description="Are you sure you want to delete this conversation? This is irreversible."
        selection={{
          selectHandler: confirmDelete,
          selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
          selectText: 'Delete',
        }}
      />
    </Dialog>
  );
}
