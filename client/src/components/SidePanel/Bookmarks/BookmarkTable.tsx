import React, { useCallback, useEffect, useState } from 'react';
import type { ConversationTagsResponse, TConversationTag } from 'librechat-data-provider';
import { Table, TableHeader, TableBody, TableRow, TableCell, Input, Button } from '~/components/ui';
import { BookmarkContext, useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTableRow from './BookmarkTableRow';
import { useLocalize } from '~/hooks';

const removeDuplicates = (bookmarks: TConversationTag[]) => {
  const seen = new Set();
  return bookmarks.filter((bookmark) => {
    const duplicate = seen.has(bookmark._id);
    seen.add(bookmark._id);
    return !duplicate;
  });
};

const BookmarkTable = () => {
  const localize = useLocalize();
  const [rows, setRows] = useState<ConversationTagsResponse>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;

  const { bookmarks = [] } = useBookmarkContext();
  useEffect(() => {
    const _bookmarks = removeDuplicates(bookmarks).sort((a, b) => a.position - b.position);
    setRows(_bookmarks);
  }, [bookmarks]);

  const moveRow = useCallback((dragIndex: number, hoverIndex: number) => {
    setRows((prevTags: TConversationTag[]) => {
      const updatedRows = [...prevTags];
      const [movedRow] = updatedRows.splice(dragIndex, 1);
      updatedRows.splice(hoverIndex, 0, movedRow);
      return updatedRows.map((row, index) => ({ ...row, position: index }));
    });
  }, []);

  const renderRow = useCallback(
    (row: TConversationTag) => {
      return <BookmarkTableRow key={row._id} moveRow={moveRow} row={row} position={row.position} />;
    },
    [moveRow],
  );

  const filteredRows = rows.filter(
    (row) => row.tag && row.tag.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentRows = filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  return (
    <BookmarkContext.Provider value={{ bookmarks }}>
      <div className="flex items-center gap-4 py-4">
        <Input
          placeholder={localize('com_ui_bookmarks_filter')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border-border-light placeholder:text-text-secondary"
        />
      </div>
      <div className="overflow-y-auto rounded-md border border-border-light">
        <Table className="table-fixed border-separate border-spacing-0">
          <TableHeader>
            <TableRow>
              <TableCell className="w-full bg-header-primary px-3 py-3.5 pl-6">
                <div>{localize('com_ui_bookmarks_title')}</div>
              </TableCell>
              <TableCell className="w-full bg-header-primary px-3 py-3.5 sm:pl-6">
                <div>{localize('com_ui_bookmarks_count')}</div>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>{currentRows.map((row) => renderRow(row))}</TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between py-4">
        <div className="pl-1 text-text-secondary">
          {localize('com_ui_showing')} {pageIndex * pageSize + 1} -{' '}
          {Math.min((pageIndex + 1) * pageSize, filteredRows.length)} {localize('com_ui_of')}{' '}
          {filteredRows.length}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
            disabled={pageIndex === 0}
          >
            {localize('com_ui_prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPageIndex((prev) =>
                (prev + 1) * pageSize < filteredRows.length ? prev + 1 : prev,
              )
            }
            disabled={(pageIndex + 1) * pageSize >= filteredRows.length}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </BookmarkContext.Provider>
  );
};

export default BookmarkTable;
