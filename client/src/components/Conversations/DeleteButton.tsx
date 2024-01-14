import { useParams } from 'react-router-dom';
import { useDeleteConversationMutation } from 'librechat-data-provider/react-query';
import { useLocalize, useConversations, useConversation } from '~/hooks';
import { Dialog, DialogTrigger, Label } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { TrashIcon, CrossIcon } from '~/components/svg';

export default function DeleteButton({ conversationId, renaming, retainView, title }) {
  const localize = useLocalize();
  const { newConversation } = useConversation();
  const { refreshConversations } = useConversations();
  const { conversationId: currentConvoId } = useParams();
  const deleteConvoMutation = useDeleteConversationMutation(conversationId);

  const confirmDelete = () => {
    deleteConvoMutation.mutate(
      { conversationId, source: 'button' },
      {
        onSuccess: () => {
          if (currentConvoId == conversationId) {
            newConversation();
          }

          refreshConversations();
          retainView();
        },
      },
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-1 hover:text-white">{renaming ? <CrossIcon /> : <TrashIcon />}</button>
      </DialogTrigger>
      <DialogTemplate
        title={localize('com_ui_delete_conversation')}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                  {localize('com_ui_delete_conversation_confirm')} <strong>{title}</strong>
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler: confirmDelete,
          selectClasses: 'bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </Dialog>
  );
}
