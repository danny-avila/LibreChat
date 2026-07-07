import { useLocation, useNavigate } from 'react-router-dom';
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
import type { TConversationTag } from 'librechat-data-provider';
import { useDeleteConversationTagMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

export default function BookmarkDeleteDialog({
  open,
  onOpenChange,
  bookmark,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmark: TConversationTag;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToastContext();

  const deleteTagMutation = useDeleteConversationTagMutation({
    onSuccess: () => {
      onOpenChange(false);
      if (location.pathname === `/bookmarks/${encodeURIComponent(bookmark.tag)}`) {
        navigate('/bookmarks');
      }
    },
    onError: () =>
      showToast({
        message: localize('com_ui_bookmarks_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      }),
  });

  const confirmDelete = () => {
    deleteTagMutation.mutate(bookmark.tag);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-md" showCloseButton={false}>
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_bookmarks_delete')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="text-sm text-text-secondary">
          {localize('com_ui_bookmark_delete_confirm')} <strong>{bookmark.tag}</strong>
        </div>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button
            variant="destructive"
            onClick={confirmDelete}
            disabled={deleteTagMutation.isLoading}
          >
            {deleteTagMutation.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_ui_delete')
            )}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
