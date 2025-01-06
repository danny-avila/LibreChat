import React, { useState, useEffect } from 'react';
import { ListFilter } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
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
import useLocalize from '~/hooks/useLocalize';
import { TrashIcon, Spinner } from '~/components/svg';
import { useMediaQuery } from '~/hooks';
import { cn } from '~/utils';

type AugmentedColumnDef<TData, TValue> = ColumnDef<TData, TValue> & {
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
  };
};

interface PaginatedResponse<TData> {
  data: TData[];
  totalPages: number;
  totalItems: number;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  fetchData: (options: {
    page: number;
    filterValue?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
  }) => Promise<PaginatedResponse<TData>>;
  onDelete?: (selectedRows: TData[]) => Promise<void>;
  filterColumn?: string;
  defaultSort?: SortingState;
  columnVisibilityMap?: Record<string, string>;
  className?: string;
  pageSize?: number;
}

export default function DataTable<TData, TValue>({
  columns,
  fetchData,
  onDelete,
  filterColumn,
  defaultSort = [],
  columnVisibilityMap = {},
  className = '',
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const [data, setData] = useState<TData[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const table = useReactTable({
    data,
    columns,
    pageCount: totalPages,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: {
        pageIndex: currentPage,
        pageSize,
      },
    },
  });

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const sortColumn = sorting[0];
        const filterValue =
          filterColumn && table.getColumn(filterColumn)
            ? (table.getColumn(filterColumn)?.getFilterValue() as string)
            : undefined;

        const response = await fetchData({
          page: currentPage,
          filterValue,
          sortBy: sortColumn.id,
          sortDirection: sortColumn.desc ? 'desc' : 'asc',
        });

        setData(response.data);
        setTotalPages(response.totalPages);
        setTotalItems(response.totalItems);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentPage, sorting, columnFilters, filterColumn, table, fetchData]);

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    setIsDeleting(true);
    const itemsToDelete = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
    await onDelete(itemsToDelete);
    setIsDeleting(false);
    setRowSelection({});

    const response = await fetchData({ page: currentPage });
    setData(response.data);
    setTotalPages(response.totalPages);
    setTotalItems(response.totalItems);
  };

  return (
    <div className={cn('flex h-full flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2 py-2 sm:gap-4 sm:py-4">
        {onDelete && (
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={!table.getFilteredSelectedRowModel().rows.length || isDeleting}
            className={cn('min-w-[40px] transition-all duration-200', isSmallScreen && 'px-2 py-1')}
          >
            {isDeleting ? (
              <Spinner className="size-3.5 sm:size-4" />
            ) : (
              <>
                <TrashIcon className="size-3.5 text-red-400 sm:size-4" />
                {!isSmallScreen && <span className="ml-2">{localize('com_ui_delete')}</span>}
              </>
            )}
          </Button>
        )}

        {filterColumn && table.getColumn(filterColumn) && (
          <Input
            placeholder={localize('com_files_filter')}
            value={table.getColumn(filterColumn)?.getFilterValue() as string}
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

      <div className="relative grid h-full max-h-[calc(100vh-20rem)] w-full flex-1 overflow-hidden overflow-x-auto overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/5">
            <Spinner className="size-8" />
          </div>
        )}

        <Table className="w-full min-w-[300px] border-separate border-spacing-0">
          <TableHeader className="sticky top-0 z-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border-light">
                {headerGroup.headers.map((header) => {
                  const columnDef = header.column.columnDef as AugmentedColumnDef<TData, TValue>;
                  const style: React.CSSProperties = {
                    width: isSmallScreen ? columnDef.meta?.mobileSize : columnDef.meta?.size,
                    minWidth: columnDef.meta?.minWidth,
                  };

                  return (
                    <TableHead
                      key={header.id}
                      className="whitespace-nowrap bg-surface-secondary px-2 py-2 text-left text-sm font-medium text-text-secondary sm:px-4"
                      style={style}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="w-full">
            {data.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-border-light transition-colors hover:bg-surface-secondary [tr:last-child_&]:border-b-0"
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnDef = cell.column.columnDef as AugmentedColumnDef<TData, TValue>;
                    const style: React.CSSProperties = {
                      maxWidth: columnDef.meta?.size,
                    };

                    return (
                      <TableCell
                        key={cell.id}
                        className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                        style={style}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {localize('com_files_no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2 py-4">
        <div className="ml-2 flex-1 truncate text-xs text-muted-foreground sm:ml-4 sm:text-sm">
          <span className="hidden sm:inline">
            {localize(
              'com_files_number_selected',
              `${table.getFilteredSelectedRowModel().rows.length}`,
              `${totalItems}`,
            )}
          </span>
          <span className="sm:hidden">
            {`${table.getFilteredSelectedRowModel().rows.length}/${totalItems}`}
          </span>
        </div>
        <div className="flex items-center space-x-1 pr-2 text-xs font-bold text-text-primary sm:text-sm">
          <span className="hidden sm:inline">{localize('com_ui_page')}</span>
          <span>{currentPage + 1}</span>
          <span>/</span>
          <span>{totalPages}</span>
        </div>
        <Button
          className="select-none"
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((current) => Math.max(0, current - 1))}
          disabled={currentPage === 0 || isLoading}
        >
          {localize('com_ui_prev')}
        </Button>
        <Button
          className="select-none"
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((current) => Math.min(totalPages - 1, current + 1))}
          disabled={currentPage === totalPages - 1 || isLoading}
        >
          {localize('com_ui_next')}
        </Button>
      </div>
    </div>
  );
}
