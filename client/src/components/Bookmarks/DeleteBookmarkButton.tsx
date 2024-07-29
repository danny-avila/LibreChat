import { useCallback } from 'react';
import type { FC } from 'react';
import { useDeleteConversationTagMutation } from '~/data-provider';
import TooltipIcon from '~/components/ui/TooltipIcon';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { Label } from '~/components/ui';
import { useLocalize } from '~/hooks';

const DeleteBookmarkButton: FC<{
  bookmark: string;
  tabIndex?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ bookmark, tabIndex = 0, onFocus, onBlur }) => {
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
          {localize('com_ui_bookmark_delete_confirm')} {bookmark}
        </Label>
      }
      confirm={confirmDelete}
      className="transition-color flex h-7 w-7 min-w-7 items-center justify-center rounded-lg duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
      icon={<TrashIcon className="size-4" />}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
};

export default DeleteBookmarkButton;
