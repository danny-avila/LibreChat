import type { TConversationTag } from 'librechat-data-provider';
import BookmarkEmptyState from './BookmarkEmptyState';
import BookmarkCard from './BookmarkCard';
import { useLocalize } from '~/hooks';

interface BookmarkListProps {
  bookmarks: TConversationTag[];
  moveRow: (dragIndex: number, hoverIndex: number) => void;
  isFiltered?: boolean;
}

export default function BookmarkList({
  bookmarks,
  moveRow,
  isFiltered = false,
}: BookmarkListProps) {
  const localize = useLocalize();

  if (bookmarks.length === 0) {
    return <BookmarkEmptyState isFiltered={isFiltered} />;
  }

  return (
    <div className="space-y-2" role="list" aria-label={localize('com_ui_bookmarks')}>
      {bookmarks.map((bookmark) => (
        <div key={bookmark._id} role="listitem">
          <BookmarkCard bookmark={bookmark} position={bookmark.position} moveRow={moveRow} />
        </div>
      ))}
    </div>
  );
}
