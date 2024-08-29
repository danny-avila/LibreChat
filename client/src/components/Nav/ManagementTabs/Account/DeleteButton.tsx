import React, { useCallback, useState } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import { useDeleteConversationMutation } from '~/data-provider';
import {
  OGDialog,
  OGDialogTrigger,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { TrashIcon } from '~/components/svg';
import type { TUser } from 'librechat-data-provider';
type DeleteButtonProps = {
  user: TUser;
  className?: string;
  showDeleteDialog?: boolean;
  setShowDeleteDialog?: (value: boolean) => void;
};

export default function DeleteButton({
  user,
  className = '',
  showDeleteDialog,
  setShowDeleteDialog,
}: DeleteButtonProps) {
  // const localize = useLocalize();
  // const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // const deleteConvoMutation = useDeleteConversationMutation({
  //   onSuccess: () => {
  //     console.log('删除成功！');
  //   },
  // });

  // const confirmDelete = useCallback(() => {
  //   const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
  //   const thread_id = messages?.[messages.length - 1]?.thread_id;

  //   deleteConvoMutation.mutate({ conversationId, thread_id, source: 'button' });
  // }, [conversationId, deleteConvoMutation, queryClient]);

  const confirmDelete = useCallback(() => {
    console.log('删除用户');
  }, [user]);

  const dialogContent = (
    <OGDialogTemplate
      showCloseButton={false}
      title='删除用户？'
      className="z-[1000] max-w-[450px]"
      main={
        <>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                确定要删除用户: <strong>{user.name}</strong>？其关联数据会被全部清空！
              </Label>
            </div>
          </div>
        </>
      }
      selection={{
        selectHandler: confirmDelete,
        selectClasses:
          'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
        selectText: '删除',
      }}
    />
  );

  if (showDeleteDialog !== undefined && setShowDeleteDialog !== undefined) {
    return (
      <OGDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        {dialogContent}
      </OGDialog>
    );
  }

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <OGDialogTrigger asChild>
            <TooltipTrigger asChild>
              <button>
                <TrashIcon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
          </OGDialogTrigger>
          <TooltipContent side="top" sideOffset={0} className={className}>
            确定
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {dialogContent}
    </OGDialog>
  );
}
