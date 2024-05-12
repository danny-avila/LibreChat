import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import { useDeleteConversationMutation } from '~/data-provider';
import {
  Dialog,
  DialogTrigger,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { TrashIcon, CrossIcon } from '~/components/svg';
import { useLocalize, useNewConvo } from '~/hooks';

export default function DeleteButton({
  conversationId,
  renaming,
  retainView,
  title,
  appendLabel = false,
  className = '',
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();
  const deleteConvoMutation = useDeleteConversationMutation({
    onSuccess: () => {
      if (currentConvoId === conversationId) {
        newConversation();
      }
      retainView();
    },
  });

  const confirmDelete = useCallback(() => {
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    const thread_id = messages?.[messages?.length - 1]?.thread_id;

    deleteConvoMutation.mutate({ conversationId, thread_id, source: 'button' });
  }, [conversationId, deleteConvoMutation, queryClient]);

  const renderDeleteButton = () => {
    if (appendLabel) {
      return (
        <>
          <TrashIcon /> {localize('com_ui_delete')}
        </>
      );
    }
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <TrashIcon className="h-5 w-5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize('com_ui_delete')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className={className}>{renaming ? <CrossIcon /> : renderDeleteButton()}</button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
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
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </Dialog>
  );
}
