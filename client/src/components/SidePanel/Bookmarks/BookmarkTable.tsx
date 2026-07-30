import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, FilterInput, OGDialogTrigger, TooltipAnchor } from '@librechat/client';
import type { ConversationTagsResponse, TConversationTag } from 'librechat-data-provider';
import { BookmarkContext, useBookmarkContext } from '~/Providers/BookmarkContext';
import { BookmarkEditDialog } from '~/components/Bookmarks';
import BookmarkCardSkeleton from './BookmarkCardSkeleton';
import { PanelContent } from '~/components/ui';
import BookmarkList from './BookmarkList';
import { useLocalize } from '~/hooks';

const pageSize = 10;

const removeDuplicates = (bookmarks: TConversationTag[]) => {
  const seen = new Set();
  return bookmarks.filter((bookmark) => {
    const duplicate = seen.has(bookmark._id);
    seen.add(bookmark._id);
    return !duplicate;
  });
};

const BookmarkTable = ({ isLoading = false }: { isLoading?: boolean }) => {
  const localize = useLocalize();
  const [rows, setRows] = useState<ConversationTagsResponse>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { bookmarks = [] } = useBookmarkContext();

  useEffect(() => {
    const _bookmarks = removeDuplicates(bookmarks).sort((a, b) => a.position - b.position);
    setRows(_bookmarks);
  }, [bookmarks]);

  // Reset page when search changes
  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  const moveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    setRows((prevTags: TConversationTag[]) => {
      const updatedRows = [...prevTags];
      const [movedRow] = updatedRows.splice(dragIndex, 1);
      updatedRows.splice(hoverIndex, 0, movedRow);
      return updatedRows.map((row, index) => ({ ...row, position: index }));
    });
  }, []);

  const filteredRows = rows.filter(
    (row) => row.tag && row.tag.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentRows = filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const totalPages = Math.ceil(filteredRows.length / pageSize);

  return (
    <BookmarkContext.Provider value={{ bookmarks }}>
      <div
        role="region"
        aria-label={localize('com_ui_bookmarks')}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Sticky header: filter + create */}
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
          <FilterInput
            inputId="bookmarks-filter"
            label={localize('com_ui_bookmarks_filter')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            containerClassName="flex-1"
          />
          <BookmarkEditDialog context="BookmarkTable" open={createOpen} setOpen={setCreateOpen}>
            <OGDialogTrigger asChild>
              <TooltipAnchor
                description={localize('com_ui_bookmarks_new')}
                side="bottom"
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 bg-transparent"
                    aria-label={localize('com_ui_bookmarks_new')}
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                }
              />
            </OGDialogTrigger>
          </BookmarkEditDialog>
        </div>

        {/* Only the list scrolls */}
        <PanelContent
          isLoading={isLoading}
          skeleton={<BookmarkCardSkeleton />}
          className="px-3 pb-3"
        >
          <BookmarkList
            bookmarks={currentRows}
            moveRow={moveRow}
            isFiltered={searchQuery.length > 0}
          />
        </PanelContent>

        {/* Pagination */}
        {!isLoading && filteredRows.length > pageSize && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-3 pb-3"
            role="navigation"
            aria-label="Pagination"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
              disabled={pageIndex === 0}
              aria-label={localize('com_ui_prev')}
            >
              {localize('com_ui_prev')}
            </Button>
            <div className="whitespace-nowrap text-sm" aria-live="polite">
              {pageIndex + 1} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => (prev + 1 < totalPages ? prev + 1 : prev))}
              disabled={pageIndex + 1 >= totalPages}
              aria-label={localize('com_ui_next')}
            >
              {localize('com_ui_next')}
            </Button>
          </div>
        )}
      </div>
    </BookmarkContext.Provider>
  );
};

export default BookmarkTable;
