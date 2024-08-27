import React, { useCallback, useEffect, useState } from 'react';
import type { ConversationTagsResponse, TConversationTag } from 'librechat-data-provider';
import { Table, TableHeader, TableBody, TableRow, TableCell, Input, Button } from '~/components/ui';
import { BookmarkContext, useBookmarkContext } from '~/Providers/BookmarkContext';
import BookmarkTableRow from './BookmarkTableRow';
import { useLocalize } from '~/hooks';

const BookmarkTable = () => {
  const localize = useLocalize();
  const [rows, setRows] = useState<ConversationTagsResponse>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;

  const { bookmarks } = useBookmarkContext();
  useEffect(() => {
    setRows(
      bookmarks
        .map((item) => ({ id: item.tag, ...item }))
        .sort((a, b) => a.position - b.position) || [],
    );
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
      return <BookmarkTableRow key={row.tag} moveRow={moveRow} row={row} position={row.position} />;
    },
    [moveRow],
  );

  const filteredRows = rows.filter((row) =>
    row.tag.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentRows = filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  return (
    <BookmarkContext.Provider value={{ bookmarks }}>
      <div className="flex items-center gap-4 py-4">
        <Input
          placeholder={localize('com_ui_bookmarks_filter')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full dark:border-gray-700"
        />
      </div>
      <div className="overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
        <Table className="table-fixed border-separate border-spacing-0">
          <TableHeader>
            <TableRow>
              <TableCell className="w-full px-3 py-3.5 pl-6 dark:bg-gray-700">
                <div>{localize('com_ui_bookmarks_title')}</div>
              </TableCell>
              <TableCell className="w-full px-3 py-3.5 dark:bg-gray-700 sm:pl-6">
                <div>{localize('com_ui_bookmarks_count')}</div>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>{currentRows.map((row) => renderRow(row))}</TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between py-4">
        <div className="pl-1 text-gray-400">
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
