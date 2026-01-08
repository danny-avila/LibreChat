import { useState, useRef, useCallback } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  TooltipAnchor,
  OGDialogTrigger,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { TConversationTag } from 'librechat-data-provider';
import { useDeleteConversationTagMutation } from '~/data-provider';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

interface BookmarkCardActionsProps {
  bookmark: TConversationTag;
}

export default function BookmarkCardActions({ bookmark }: BookmarkCardActionsProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  const deleteBookmarkMutation = useDeleteConversationTagMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_bookmarks_delete_success'),
      });
      setDeleteOpen(false);
    },
    onError: () => {
      showToast({
        message: localize('com_ui_bookmarks_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const isDeleting = deleteBookmarkMutation.isLoading;

  const handleDelete = useCallback(async () => {
    await deleteBookmarkMutation.mutateAsync(bookmark.tag);
  }, [bookmark.tag, deleteBookmarkMutation]);

  return (
    <div className="flex items-center gap-1">
      {/* Edit button */}
      <BookmarkEditDialog
        context="BookmarkCardActions"
        bookmark={bookmark}
        open={editOpen}
        setOpen={setEditOpen}
        triggerRef={editTriggerRef}
      >
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_edit')}
            side="top"
            render={
              <Button
                ref={editTriggerRef}
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={localize('com_ui_bookmarks_edit')}
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            }
          />
        </OGDialogTrigger>
      </BookmarkEditDialog>

      {/* Delete button */}
      <OGDialog open={deleteOpen} onOpenChange={setDeleteOpen} triggerRef={deleteTriggerRef}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_delete')}
            side="top"
            render={
              <Button
                ref={deleteTriggerRef}
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={localize('com_ui_bookmarks_delete')}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            }
          />
        </OGDialogTrigger>
        <OGDialogTemplate
          title={localize('com_ui_bookmarks_delete')}
          className="w-11/12 max-w-md"
          description={localize('com_ui_bookmark_delete_confirm', { 0: bookmark.tag })}
          selection={
            <Button onClick={handleDelete} variant="destructive">
              {isDeleting ? <Spinner /> : localize('com_ui_delete')}
            </Button>
          }
        />
      </OGDialog>
    </div>
  );
}
