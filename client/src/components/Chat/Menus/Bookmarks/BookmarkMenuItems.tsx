import React from 'react';
import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import { BookmarkItems, BookmarkItem } from '~/components/Bookmarks';
import { useLocalize } from '~/hooks';

export const BookmarkMenuItems: FC<{
  tags: string[];
  handleToggleOpen?: () => void;
  handleSubmit: (tag?: string) => void;
}> = ({
  tags,
  handleSubmit,
  handleToggleOpen = async () => {
    ('');
  },
}) => {
  const localize = useLocalize();

  return (
    <BookmarkItems
      tags={tags}
      handleSubmit={handleSubmit}
      header={
        <BookmarkItem
          tag={localize('com_ui_bookmarks_new')}
          data-testid="bookmark-item-new"
          handleSubmit={handleToggleOpen}
          selected={false}
          icon={<BookmarkPlusIcon className="size-4" aria-label="Add Bookmark" />}
        />
      }
    />
  );
};
