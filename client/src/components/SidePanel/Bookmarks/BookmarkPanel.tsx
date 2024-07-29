import { BookmarkPlusIcon } from 'lucide-react';
import { useConversationTagsQuery, useRebuildConversationTagsMutation } from '~/data-provider';
import { Button } from '~/components/ui';
import { BookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import BookmarkTable from './BookmarkTable';
import { Spinner } from '~/components/svg';
import { useLocalize } from '~/hooks';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';

const BookmarkPanel = () => {
  const localize = useLocalize();
  const { mutate, isLoading } = useRebuildConversationTagsMutation();
  const { data } = useConversationTagsQuery();
  const rebuildTags = () => {
    mutate({});
  };
  return (
    <div className="h-auto max-w-full overflow-x-hidden">
      <BookmarkContext.Provider value={{ bookmarks: data || [] }}>
        <BookmarkTable />
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={rebuildTags} className="w-50 text-sm">
            {isLoading ? (
              <Spinner />
            ) : (
              <div className="flex gap-2">
                {localize('com_ui_bookmarks_rebuild')}
                <HoverCardSettings side="top" text="com_nav_info_bookmarks_rebuild" />
              </div>
            )}
          </Button>
          <BookmarkEditDialog
            trigger={
              <Button variant="outline" onClick={rebuildTags} className="w-full text-sm">
                <BookmarkPlusIcon className="mr-1 size-4" />
                <div className="break-all">{localize('com_ui_bookmarks_new')}</div>
              </Button>
            }
          />
        </div>
      </BookmarkContext.Provider>
    </div>
  );
};
export default BookmarkPanel;
