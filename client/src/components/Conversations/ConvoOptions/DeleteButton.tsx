import React, { useCallback, useState } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import type { TMessage } from 'librechat-data-provider';
import {
  Label,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogHeader,
  Button,
  Spinner,
} from '~/components';
import { useDeleteConversationMutation } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

type DeleteButtonProps = {
  conversationId: string;
  retainView: () => void;
  title: string;
  showDeleteDialog?: boolean;
  setShowDeleteDialog?: (value: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
};

export function DeleteConversationDialog({
  setShowDeleteDialog,
  conversationId,
  retainView,
  title,
}: {
  setShowDeleteDialog: (value: boolean) => void;
  conversationId: string;
  retainView: () => void;
  title: string;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: () => {
      setShowDeleteDialog(false);
      if (currentConvoId === conversationId || currentConvoId === 'new') {
        newConversation();
        navigate('/c/new', { replace: true });
      }
      retainView();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_convo_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const confirmDelete = useCallback(() => {
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    const thread_id = messages?.[messages.length - 1]?.thread_id;
    const endpoint = messages?.[messages.length - 1]?.endpoint;

    deleteMutation.mutate({ conversationId, thread_id, endpoint, source: 'button' });
  }, [conversationId, deleteMutation, queryClient]);

  return (
    <OGDialogContent
      title={localize('com_ui_delete_confirm') + ' ' + title}
      className="w-11/12 max-w-md"
    >
      <OGDialogHeader>
        <OGDialogTitle>{localize('com_ui_delete_conversation')}</OGDialogTitle>
      </OGDialogHeader>
      <div>
        {localize('com_ui_delete_confirm')} <strong>{title}</strong> ?
      </div>
      <div className="flex justify-end gap-4 pt-4">
        <Button aria-label="cancel" variant="outline" onClick={() => setShowDeleteDialog(false)}>
          {localize('com_ui_cancel')}
        </Button>
        <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isLoading}>
          {deleteMutation.isLoading ? <Spinner /> : localize('com_ui_delete')}
        </Button>
      </div>
    </OGDialogContent>
  );
}

export default function DeleteButton({
  conversationId,
  retainView,
  title,
  showDeleteDialog,
  setShowDeleteDialog,
  triggerRef,
}: DeleteButtonProps) {
  if (showDeleteDialog === undefined || setShowDeleteDialog === undefined) {
    return null;
  }

  if (!conversationId) {
    return null;
  }

  return (
    <OGDialog open={showDeleteDialog!} onOpenChange={setShowDeleteDialog!} triggerRef={triggerRef}>
      <DeleteConversationDialog
        setShowDeleteDialog={setShowDeleteDialog}
        conversationId={conversationId}
        retainView={retainView}
        title={title}
      />
    </OGDialog>
  );
}
