import { useCallback } from 'react';
import type { FC } from 'react';
import { useDeleteConversationTagMutation } from '~/data-provider';
import TooltipIcon from '~/components/ui/TooltipIcon';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { Label } from '~/components/ui';
import { useLocalize } from '~/hooks';

const DeleteBookmarkButton: FC<{ bookmark: string }> = ({ bookmark }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const deleteBookmarkMutation = useDeleteConversationTagMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_bookmarks_delete_success'),
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_bookmarks_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const confirmDelete = useCallback(async () => {
    await deleteBookmarkMutation.mutateAsync(bookmark);
  }, [bookmark, deleteBookmarkMutation]);

  return (
    <TooltipIcon
      disabled={false}
      appendLabel={false}
      title="Delete Bookmark"
      confirmMessage={
        <Label htmlFor="bookmark" className="text-left text-sm font-medium">
          {localize('com_ui_bookmark_delete_confirm')} : {bookmark}
        </Label>
      }
      confirm={confirmDelete}
      className="hover:text-gray-300 focus-visible:bg-gray-100 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600"
      icon={<TrashIcon className="size-4" />}
    />
  );
};
export default DeleteBookmarkButton;
