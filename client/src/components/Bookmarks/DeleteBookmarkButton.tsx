import { useCallback, useState } from 'react';
import type { FC } from 'react';
import { Label, OGDialog, OGDialogTrigger, TooltipAnchor } from '~/components/ui';
import { useDeleteConversationTagMutation } from '~/data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { TrashIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

const DeleteBookmarkButton: FC<{
  bookmark: string;
  tabIndex?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ bookmark, tabIndex = 0, onFocus, onBlur }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(false);

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!open);
    }
  };

  return (
    <>
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogTrigger asChild>
          <TooltipAnchor
            description={localize('com_ui_delete')}
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
            tabIndex={tabIndex}
            onFocus={onFocus}
            onBlur={onBlur}
            onClick={() => setOpen(!open)}
            onKeyDown={handleKeyDown}
          >
            <TrashIcon className="size-4" />
          </TooltipAnchor>
        </OGDialogTrigger>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_bookmarks_delete')}
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_bookmark_delete_confirm')} {bookmark}
            </Label>
          }
          selection={{
            selectHandler: confirmDelete,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </>
  );
};

export default DeleteBookmarkButton;
