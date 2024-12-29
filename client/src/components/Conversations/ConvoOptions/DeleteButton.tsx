import React, { useCallback } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import type { TMessage } from 'librechat-data-provider';
import { useDeleteConversationMutation } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useNewConvo } from '~/hooks';
import { OGDialog, Label } from '~/components';

type DeleteButtonProps = {
  conversationId: string;
  retainView: () => void;
  title: string;
  showDeleteDialog?: boolean;
  setShowDeleteDialog?: (value: boolean) => void;
};

export function DeleteConversationDialog({
  conversationId,
  retainView,
  title,
}: {
  conversationId: string;
  retainView: () => void;
  title: string;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();

  const deleteConvoMutation = useDeleteConversationMutation({
    onSuccess: () => {
      if (currentConvoId === conversationId || currentConvoId === 'new') {
        newConversation();
        navigate('/c/new', { replace: true });
      }
      retainView();
    },
  });

  const confirmDelete = useCallback(() => {
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    const thread_id = messages?.[messages.length - 1]?.thread_id;
    const endpoint = messages?.[messages.length - 1]?.endpoint;

    deleteConvoMutation.mutate({ conversationId, thread_id, endpoint, source: 'button' });
  }, [conversationId, deleteConvoMutation, queryClient]);

  return (
    <OGDialogTemplate
      showCloseButton={false}
      title={localize('com_ui_delete_conversation')}
      className="max-w-[450px]"
      main={
        <>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                {localize('com_ui_delete_confirm')} <strong>{title}</strong>
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
  );
}

export default function DeleteButton({
  conversationId,
  retainView,
  title,
  showDeleteDialog,
  setShowDeleteDialog,
}: DeleteButtonProps) {
  if (showDeleteDialog === undefined && setShowDeleteDialog === undefined) {
    return null;
  }

  if (!conversationId) {
    return null;
  }

  return (
    <OGDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <DeleteConversationDialog
        conversationId={conversationId}
        retainView={retainView}
        title={title}
      />
    </OGDialog>
  );
}
