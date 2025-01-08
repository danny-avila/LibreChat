import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ListFilter } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './';
import { TrashIcon, Spinner } from '~/components/svg';
import { useLocalize, useMediaQuery } from '~/hooks';
import { cn } from '~/utils';

type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
  };
};

interface DataTableProps<TData, TValue> {
  columns: TableColumn<TData, TValue>[];
  data: TData[];
  onDelete?: (selectedRows: TData[]) => Promise<void>;
  filterColumn?: string;
  defaultSort?: SortingState;
  columnVisibilityMap?: Record<string, string>;
  className?: string;
  pageSize?: number;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: (options?: unknown) => Promise<unknown>;
}

function getColumnStyle<TData, TValue>(
  column: TableColumn<TData, TValue>,
  isSmallScreen: boolean,
): React.CSSProperties {
  return {
    width: isSmallScreen ? column.meta?.mobileSize : column.meta?.size,
    minWidth: column.meta?.minWidth,
    maxWidth: column.meta?.size,
  };
}

export default function DataTable<TData, TValue>({
  columns,
  data,
  onDelete,
  filterColumn,
  defaultSort = [],
  columnVisibilityMap = {},
  className = '',
  isFetchingNextPage = false,
  hasNextPage = false,
  fetchNextPage,
}: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [tableState, setTableState] = useState({
    isDeleting: false,
    rowSelection: {},
    sorting: defaultSort as SortingState,
    columnFilters: [] as ColumnFiltersState,
    columnVisibility: {} as VisibilityState,
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting: tableState.sorting,
      columnFilters: tableState.columnFilters,
      columnVisibility: tableState.columnVisibility,
      rowSelection: tableState.rowSelection,
    },
    onSortingChange: (sorting) =>
      setTableState((prev) => ({ ...prev, sorting: sorting as SortingState })),
    onColumnFiltersChange: (filters) =>
      setTableState((prev) => ({ ...prev, columnFilters: filters as ColumnFiltersState })),
    onColumnVisibilityChange: (visibility) =>
      setTableState((prev) => ({ ...prev, columnVisibility: visibility as VisibilityState })),
    onRowSelectionChange: (selection) =>
      setTableState((prev) => ({ ...prev, rowSelection: selection })),
  });

  useEffect(() => {
    const div = scrollRef.current;
    if (!div) {
      return;
    }

    const onScroll = () => {
      if (!hasNextPage || isFetchingNextPage) {
        return;
      }

      const bottom = div.scrollHeight - div.scrollTop <= div.clientHeight * 1.5;
      if (bottom) {
        fetchNextPage?.();
      }
    };

    div.addEventListener('scroll', onScroll);
    return () => div.removeEventListener('scroll', onScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) {
      return;
    }

    setTableState((prev) => ({ ...prev, isDeleting: true }));
    const itemsToDelete = table.getFilteredSelectedRowModel().rows.map((row) => row.original);

    try {
      await onDelete(itemsToDelete);
    } finally {
      setTableState((prev) => ({ ...prev, isDeleting: false, rowSelection: {} }));
    }
  }, [onDelete, table]);

  const selectedRowsCount = table.getFilteredSelectedRowModel().rows.length;

  const DeleteButton = useCallback(() => {
    if (!onDelete) {
      return null;
    }

    return (
      <Button
        variant="outline"
        onClick={handleDelete}
        disabled={!selectedRowsCount || tableState.isDeleting}
        className={cn('min-w-[40px] transition-all duration-200', isSmallScreen && 'px-2 py-1')}
      >
        {tableState.isDeleting ? (
          <Spinner className="size-4" />
        ) : (
          <>
            <TrashIcon className="size-3.5 text-red-400 sm:size-4" />
            {!isSmallScreen && <span className="ml-2">{localize('com_ui_delete')}</span>}
          </>
        )}
      </Button>
    );
  }, [onDelete, handleDelete, selectedRowsCount, tableState.isDeleting, isSmallScreen, localize]);

  return (
    <div className={cn('flex h-full flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2 py-2 sm:gap-4 sm:py-4">
        <DeleteButton />
        {filterColumn && table.getColumn(filterColumn) && (
          <Input
            placeholder={localize('com_files_filter')}
            value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ''}
            onChange={(event) => table.getColumn(filterColumn)?.setFilterValue(event.target.value)}
            className="flex-1 text-sm"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={cn('min-w-[40px]', isSmallScreen && 'px-2 py-1')}>
              <ListFilter className="size-3.5 sm:size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[300px] overflow-y-auto dark:border-gray-700 dark:bg-gray-850"
          >
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="cursor-pointer text-sm capitalize dark:text-white dark:hover:bg-gray-800"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {columnVisibilityMap[column.id] || localize(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative h-[600px] max-w-full overflow-x-auto overflow-y-auto rounded-md border border-black/10 dark:border-white/10',
          className,
        )}
      >
        <Table className="w-full min-w-[300px] border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border-light">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={
                      header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    className="cursor-pointer whitespace-nowrap bg-surface-secondary px-2 py-2 text-left text-sm font-medium text-text-secondary sm:px-4"
                    style={getColumnStyle(
                      header.column.columnDef as TableColumn<TData, TValue>,
                      isSmallScreen,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="w-full">
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className="border-b border-border-light transition-colors hover:bg-surface-secondary"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                    style={getColumnStyle(
                      cell.column.columnDef as TableColumn<TData, TValue>,
                      isSmallScreen,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {/* Infinite scroll loading indicator */}
            {(isFetchingNextPage || hasNextPage) && (
              <TableRow className="items-center justify-center hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4">
                  <div className="flex items-center justify-center">
                    {isFetchingNextPage ? (
                      <Spinner className="size-4" />
                    ) : (
                      hasNextPage && <div className="h-6" />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
