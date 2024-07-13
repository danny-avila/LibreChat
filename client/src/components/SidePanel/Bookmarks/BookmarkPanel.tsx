import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import { useConversationTagsQuery, useRebuildConversationTagsMutation } from '~/data-provider';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import BookmarkTable from './BookmarkTable';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';

const BookmarkPanel: FC<{ open: boolean; onOpenChange: (open: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const localize = useLocalize();
  const { mutate, isLoading } = useRebuildConversationTagsMutation();
  const { data } = useConversationTagsQuery();
  const rebuildTags = () => {
    mutate({});
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={true}
        className={cn(
          'overflow-x-auto shadow-2xl dark:bg-gray-700 dark:text-white md:max-h-[600px] md:min-h-[373px] md:w-[680px]',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">
            {localize('com_ui_bookmarks')}
          </DialogTitle>
        </DialogHeader>
        <BookmarkContext.Provider value={{ bookmarks: data || [] }}>
          <div className="p-0 sm:p-6 sm:pt-4">
            <BookmarkTable />
            <div className="mt-5 sm:mt-4" />
            <div className="flex justify-between gap-2 pr-2 sm:pr-0">
              <Button variant="outline" onClick={rebuildTags} className="text-sm">
                {isLoading ? (
                  <Spinner />
                ) : (
                  <div className="flex gap-2">
                    {localize('com_ui_bookmarks_rebuild')}
                    <HoverCardSettings side="bottom" text="com_nav_info_bookmarks_rebuild" />
                  </div>
                )}
              </Button>

              <div className="flex gap-2">
                <BookmarkEditDialog
                  trigger={
                    <Button variant="outline" onClick={rebuildTags} className="text-sm">
                      <BookmarkPlusIcon className="mr-1 size-4" />
                      <div className="break-all">{localize('com_ui_bookmarks_new')}</div>
                    </Button>
                  }
                />
                <Button variant="subtle" onClick={() => onOpenChange(!open)} className="text-sm">
                  {localize('com_ui_close')}
                </Button>
              </div>
            </div>
          </div>
        </BookmarkContext.Provider>
      </DialogContent>
    </Dialog>
  );
};
export default BookmarkPanel;
