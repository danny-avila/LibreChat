import React, { useState } from 'react';
import { BookmarkPlusIcon } from 'lucide-react';
import type { FC } from 'react';
import { BookmarkEditDialog, BookmarkItems, BookmarkItem } from '~/components/Bookmarks';
import { OGDialogTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';

export const BookmarkMenuItems: FC<{
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  handleSubmit: (tag?: string) => void;
  conversationId?: string;
}> = ({ tags, setTags, handleSubmit, conversationId }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const handleToggleOpen = () => setOpen(!open);

  return (
    <BookmarkItems
      tags={tags}
      handleSubmit={handleSubmit}
      header={
        <BookmarkEditDialog
          context="BookmarkMenu - BookmarkEditDialog"
          conversationId={conversationId}
          tags={tags}
          setTags={setTags}
          open={open}
          setOpen={setOpen}
        >
          <OGDialogTrigger asChild>
            <BookmarkItem
              tag={localize('com_ui_bookmarks_new')}
              data-testid="bookmark-item-new"
              handleSubmit={handleToggleOpen}
              selected={false}
              icon={<BookmarkPlusIcon className="size-4" aria-label="Add Bookmark" />}
            />
          </OGDialogTrigger>
        </BookmarkEditDialog>
      }
    />
  );
};
