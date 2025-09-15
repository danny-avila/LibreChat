import React, { useState, useCallback } from 'react';
import { Trash } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import {
  Button,
  Spinner,
  TooltipAnchor,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useDeleteConversationMutation } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useBulkSelect } from '~/components/Conversations/BulkSelectContext';

interface BulkDeleteButtonProps {
  isSmallScreen: boolean;
  retainView: () => void;
}

export default function BulkDeleteButton({ isSmallScreen, retainView }: BulkDeleteButtonProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();
  const { selectedConversations, isSelectionMode, clearSelection } = useBulkSelect();
  
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMutation = useDeleteConversationMutation({
    onSuccess: () => {
      // Individual delete success - handled in bulk operation
    },
    onError: () => {
      showToast({
        message: localize('com_ui_convo_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setIsDeleting(false);
    },
  });

  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    if (selectedConversations.size === 0) {
      return;
    }

    setIsDeleting(true);
    const conversationIds = Array.from(selectedConversations);
    let deletedCount = 0;
    let hasCurrentConvo = false;

    try {
      for (const conversationId of conversationIds) {
        if (conversationId === currentConvoId) {
          hasCurrentConvo = true;
        }

        const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
        const thread_id = messages?.[messages.length - 1]?.thread_id;
        const endpoint = messages?.[messages.length - 1]?.endpoint;

        await deleteMutation.mutateAsync({ 
          conversationId, 
          thread_id, 
          endpoint, 
          source: 'button' 
        });
        
        deletedCount++;
      }

      // If we deleted the current conversation, navigate to new
      if (hasCurrentConvo || currentConvoId === 'new') {
        newConversation();
        navigate('/c/new', { replace: true });
      }

      // Clear selection and close dialog
      clearSelection();
      setShowDeleteDialog(false);
      retainView();

      // Show success message
      showToast({
        message: localize('com_ui_bulk_delete_success', { count: deletedCount.toString() }),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });

    } catch (error) {
      showToast({
        message: localize('com_ui_bulk_delete_conversations_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    } finally {
      setIsDeleting(false);
    }
  }, [
    selectedConversations, 
    currentConvoId, 
    queryClient, 
    deleteMutation, 
    newConversation, 
    navigate, 
    clearSelection, 
    retainView, 
    showToast, 
    localize
  ]);

  // Don't render if not in selection mode
  if (!isSelectionMode || selectedConversations.size === 0) {
    return null;
  }

  return (
    <>
      <TooltipAnchor
        description={localize('com_ui_delete_selected', { count: selectedConversations.size.toString() })}
        render={
          <Button
            size="icon"
            variant="destructive"
            data-testid="bulk-delete-button"
            aria-label={localize('com_ui_delete_selected', { count: selectedConversations.size.toString() })}
            className="rounded-full border-none p-2 hover:bg-red-600 md:rounded-xl"
            onClick={handleDeleteClick}
          >
            <Trash className="icon-lg text-white" />
          </Button>
        }
      />
      
      {showDeleteDialog && (
        <OGDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <OGDialogContent
            title={localize('com_ui_bulk_delete_confirm', { count: selectedConversations.size.toString() })}
            className="w-11/12 max-w-md"
            showCloseButton={false}
          >
            <OGDialogHeader>
              <OGDialogTitle>{localize('com_ui_bulk_delete_title')}</OGDialogTitle>
            </OGDialogHeader>
            <div>
              {localize('com_ui_bulk_delete_warning', { count: selectedConversations.size.toString() })}
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <Button 
                aria-label="cancel" 
                variant="outline" 
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
              >
                {localize('com_ui_cancel')}
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmBulkDelete} 
                disabled={isDeleting}
              >
                {isDeleting ? <Spinner /> : localize('com_ui_delete')}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>
      )}
    </>
  );
}