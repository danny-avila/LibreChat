import { useState, useCallback } from 'react';
import { Archive, Trash, X, SquareCheck } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import {
  useBulkDeleteConversationsMutation,
  useBulkArchiveConversationsMutation,
} from '~/data-provider';

interface BulkSelectionToolbarProps {
  selectedIds: Set<string>;
  allConvoIds: string[];
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExit: () => void;
  retainView: () => void;
}

export default function BulkSelectionToolbar({
  selectedIds,
  allConvoIds,
  onSelectAll,
  onDeselectAll,
  onExit,
  retainView,
}: BulkSelectionToolbarProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const count = selectedIds.size;
  const allSelected = count === allConvoIds.length && allConvoIds.length > 0;

  const bulkDelete = useBulkDeleteConversationsMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_bulk_delete_success', { count }),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
      setShowDeleteDialog(false);
      onExit();
      retainView();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_bulk_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const bulkArchive = useBulkArchiveConversationsMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_bulk_archive_success', { count }),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
      setShowArchiveDialog(false);
      onExit();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_bulk_archive_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const confirmDelete = useCallback(() => {
    bulkDelete.mutate({ conversationIds: Array.from(selectedIds) });
  }, [bulkDelete, selectedIds]);

  const confirmArchive = useCallback(() => {
    bulkArchive.mutate({ conversationIds: Array.from(selectedIds), isArchived: true });
  }, [bulkArchive, selectedIds]);

  return (
    <div className="flex items-center justify-between gap-1 px-1 py-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-active-alt hover:text-text-primary"
          aria-label={allSelected ? localize('com_ui_deselect_all') : localize('com_ui_select_all')}
        >
          <SquareCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {allSelected ? localize('com_ui_deselect_all') : localize('com_ui_select_all')}
        </button>
        {count > 0 && (
          <span className="rounded-full bg-surface-active-alt px-1.5 py-0.5 text-xs text-text-primary">
            {count}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <OGDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
          <Button
            size="icon"
            variant="ghost"
            disabled={count === 0}
            onClick={() => setShowArchiveDialog(true)}
            aria-label={localize('com_ui_archive')}
            className="h-7 w-7"
            title={localize('com_ui_archive')}
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
          </Button>
          <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
            <OGDialogHeader>
              <OGDialogTitle>{localize('com_ui_bulk_archive_confirm_title')}</OGDialogTitle>
            </OGDialogHeader>
            <p className="text-sm text-text-secondary">
              {localize('com_ui_bulk_archive_confirm', { count })}
            </p>
            <div className="flex justify-end gap-4 pt-4">
              <OGDialogClose asChild>
                <Button variant="outline" aria-label="cancel">
                  {localize('com_ui_cancel')}
                </Button>
              </OGDialogClose>
              <Button variant="default" onClick={confirmArchive} disabled={bulkArchive.isLoading}>
                {bulkArchive.isLoading ? <Spinner /> : localize('com_ui_archive')}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>

        <OGDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <Button
            size="icon"
            variant="ghost"
            disabled={count === 0}
            onClick={() => setShowDeleteDialog(true)}
            aria-label={localize('com_ui_delete')}
            className="h-7 w-7"
            title={localize('com_ui_delete')}
          >
            <Trash className="h-4 w-4" aria-hidden="true" />
          </Button>
          <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
            <OGDialogHeader>
              <OGDialogTitle>{localize('com_ui_delete_conversation')}</OGDialogTitle>
            </OGDialogHeader>
            <p className="text-sm text-text-secondary">
              {localize('com_ui_bulk_delete_confirm', { count })}
            </p>
            <div className="flex justify-end gap-4 pt-4">
              <OGDialogClose asChild>
                <Button variant="outline" aria-label="cancel">
                  {localize('com_ui_cancel')}
                </Button>
              </OGDialogClose>
              <Button variant="destructive" onClick={confirmDelete} disabled={bulkDelete.isLoading}>
                {bulkDelete.isLoading ? <Spinner /> : localize('com_ui_delete')}
              </Button>
            </div>
          </OGDialogContent>
        </OGDialog>

        <Button
          size="icon"
          variant="ghost"
          onClick={onExit}
          aria-label={localize('com_ui_exit_select_mode')}
          className="h-7 w-7"
          title={localize('com_ui_exit_select_mode')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
