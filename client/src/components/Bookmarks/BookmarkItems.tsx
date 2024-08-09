import type { FC } from 'react';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkItem from './BookmarkItem';
interface BookmarkItemsProps {
  ctx: 'header' | 'nav';
  tags: string[];
  handleSubmit: (tag: string) => Promise<void>;
  header: React.ReactNode;
  highlightSelected?: boolean;
}

const BookmarkItems: FC<BookmarkItemsProps> = ({
  ctx,
  tags,
  handleSubmit,
  header,
  highlightSelected,
}) => {
  const { bookmarks } = useBookmarkContext();

  return (
    <>
      {header}
      <div className="my-1.5 h-px" role="none" />
      {bookmarks.map((bookmark) => (
        <BookmarkItem
          ctx={ctx}
          key={bookmark.tag}
          tag={bookmark.tag}
          selected={tags.includes(bookmark.tag)}
          count={bookmark.count}
          handleSubmit={handleSubmit}
          highlightSelected={highlightSelected}
        />
      ))}
    </>
  );
};

export default BookmarkItems;
