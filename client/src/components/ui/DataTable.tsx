import React, { useCallback, useEffect, useRef, useState, memo, useMemo } from 'react';
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
  Row,
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
  Checkbox,
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

type SelectionHandler = (rowId: string, selected: boolean) => void;

const SelectionCheckbox = memo(
  ({
    checked,
    onChange,
    ariaLabel,
  }: {
    checked: boolean;
    onChange: (value: boolean) => void;
    ariaLabel: string;
  }) => (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.stopPropagation()}
      className="flex h-full w-[30px] items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} />
    </div>
  ),
);

SelectionCheckbox.displayName = 'SelectionCheckbox';

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
  enableRowSelection?: boolean;
  showCheckboxes?: boolean;
}

const TableRowComponent = <TData, TValue>({
  row,
  isSmallScreen,
  onSelectionChange,
}: {
  row: Row<TData>;
  isSmallScreen: boolean;
  onSelectionChange?: SelectionHandler;
}) => {
  const handleSelection = useCallback(
    (value: boolean) => {
      row.toggleSelected(value);
      onSelectionChange?.(row.id, value);
    },
    [row, onSelectionChange],
  );

  return (
    <TableRow
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className="border-b border-border-light transition-colors hover:bg-surface-secondary"
    >
      {row.getVisibleCells().map((cell) => {
        if (cell.column.id === 'select') {
          return (
            <TableCell key={cell.id} className="px-2 py-1">
              <SelectionCheckbox
                checked={row.getIsSelected()}
                onChange={handleSelection}
                ariaLabel="Select row"
              />
            </TableCell>
          );
        }

        return (
          <TableCell
            key={cell.id}
            className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm"
            style={getColumnStyle(
              cell.column.columnDef as TableColumn<TData, TValue>,
              isSmallScreen,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
};

const MemoizedTableRow = memo(
  TableRowComponent as typeof TableRowComponent<any, any>,
  (prev, next) => {
    return (
      prev.row.id === next.row.id &&
      prev.isSmallScreen === next.isSmallScreen &&
      prev.row.getIsSelected() === next.row.getIsSelected()
    );
  },
) as typeof TableRowComponent;

function useVirtualizedWindow(totalItems: number, itemHeight: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const [version, setVersion] = useState(0);

  const visibleItems = Math.ceil(containerHeight / itemHeight);
  const bufferSize = Math.ceil(visibleItems / 2);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
  const endIndex = Math.min(
    totalItems,
    Math.floor(scrollTop / itemHeight) + visibleItems + bufferSize,
  );

  const refreshVirtualWindow = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return {
    startIndex,
    endIndex,
    setScrollTop,
    refreshVirtualWindow,
    version,
  };
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

const DeleteButton = memo(
  ({
    onDelete,
    isDeleting,
    disabled,
    isSmallScreen,
    localize,
  }: {
    onDelete?: () => Promise<void>;
    isDeleting: boolean;
    disabled: boolean;
    isSmallScreen: boolean;
    localize: (key: string) => string;
  }) => {
    if (!onDelete) {
      return null;
    }
    return (
      <Button
        variant="outline"
        onClick={onDelete}
        disabled={disabled}
        className={cn('min-w-[40px] transition-all duration-200', isSmallScreen && 'px-2 py-1')}
      >
        {isDeleting ? (
          <Spinner className="size-4" />
        ) : (
          <>
            <TrashIcon className="size-3.5 text-red-400 sm:size-4" />
            {!isSmallScreen && <span className="ml-2">{localize('com_ui_delete')}</span>}
          </>
        )}
      </Button>
    );
  },
);

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
  enableRowSelection = true,
  showCheckboxes = true,
}: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const lastDataLength = useRef(data.length);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [sorting, setSorting] = useState<SortingState>(defaultSort);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const lastScrollTop = useRef(0);

  const ROW_HEIGHT = 48;
  const containerHeight = scrollRef.current?.clientHeight ?? 600;
  const { startIndex, endIndex, setScrollTop, refreshVirtualWindow, version } =
    useVirtualizedWindow(data.length, ROW_HEIGHT, containerHeight);

  useEffect(() => {
    if (data.length !== lastDataLength.current) {
      lastDataLength.current = data.length;
      refreshVirtualWindow();
    }
  }, [data.length, refreshVirtualWindow]);

  const handleSelectionChange = useCallback((rowId: string, selected: boolean) => {
    setRowSelection((prev) => ({ ...prev, [rowId]: selected }));
  }, []);

  const tableColumns = useMemo(() => {
    if (!enableRowSelection || !showCheckboxes) {
      return columns;
    }
    const selectColumn = {
      id: 'select',
      header: ({ table }: { table: any }) => (
        <div className="flex h-full w-[30px] items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => {
              table.toggleAllPageRowsSelected(Boolean(value));
            }}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }: { row: Row<TData> }) => (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex h-full w-[30px] items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            key={`checkbox-${row.id}-${row.getIsSelected()}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              row.toggleSelected(Boolean(value));
              handleSelectionChange(row.id, Boolean(value));
            }}
            aria-label="Select row"
          />
        </div>
      ),
      meta: { size: '50px' },
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection, showCheckboxes, handleSelectionChange]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection,
    enableMultiRowSelection: true,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
  });

  const handleDelete = useCallback(async () => {
    if (!onDelete) {
      return;
    }
    setIsDeleting(true);
    const itemsToDelete = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
    try {
      await onDelete(itemsToDelete);
      refreshVirtualWindow();
    } finally {
      setRowSelection({});
      setIsDeleting(false);
    }
  }, [onDelete, table, refreshVirtualWindow]);

  const selectedRowsCount = table.getFilteredSelectedRowModel().rows.length;
  const visibleRows = useMemo(() => {
    return table.getRowModel().rows.slice(startIndex, endIndex);
  }, [table, startIndex, endIndex, version]);

  useEffect(() => {
    let rafHandle: number;
    const handleScroll = () => {
      if (!scrollRef.current) {
        return;
      }

      rafHandle = requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) {
          return;
        }

        const currentScrollTop = el.scrollTop;
        const scrollingDown = currentScrollTop > lastScrollTop.current;
        lastScrollTop.current = currentScrollTop;
        setScrollTop(currentScrollTop);

        if (scrollingDown && !isFetchingNextPage && hasNextPage) {
          const nearBottom = el.scrollHeight - currentScrollTop <= el.clientHeight * 1.5;
          if (nearBottom) {
            fetchNextPage?.();
          }
        }
      });
    };

    const div = scrollRef.current;
    div?.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      div?.removeEventListener('scroll', handleScroll);
      if (rafHandle) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, setScrollTop]);

  return (
    <div className={cn('flex h-full flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center gap-2 py-2 sm:gap-4 sm:py-4">
        {enableRowSelection && showCheckboxes && (
          <DeleteButton
            onDelete={handleDelete}
            isDeleting={isDeleting}
            disabled={!selectedRowsCount || isDeleting}
            isSmallScreen={isSmallScreen}
            localize={localize}
          />
        )}
        {typeof filterColumn === 'string' &&
          filterColumn !== '' &&
          table.getColumn(filterColumn) && (
          <Input
            placeholder={localize('com_files_filter')}
            value={table.getColumn(filterColumn)?.getFilterValue() as string}
            onChange={(event) =>
              table.getColumn(filterColumn)?.setFilterValue(event.target.value)
            }
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
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="cursor-pointer text-sm capitalize dark:text-white dark:hover:bg-gray-800"
                  checked={col.getIsVisible()}
                  onCheckedChange={(value) => col.toggleVisibility(Boolean(value))}
                >
                  {columnVisibilityMap[col.id] || localize(col.columnDef.header)}
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
          <TableHeader className="sticky top-0 z-50 bg-surface-secondary">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border-light">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      className="cursor-pointer whitespace-nowrap bg-surface-secondary px-2 py-2 text-left text-sm font-medium text-text-secondary sm:px-4"
                      style={getColumnStyle(
                        header.column.columnDef as TableColumn<TData, TValue>,
                        isSmallScreen,
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
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

          <TableBody>
            {startIndex > 0 && <tr style={{ height: `${startIndex * ROW_HEIGHT}px` }} />}
            {visibleRows.map((row) => (
              <MemoizedTableRow
                key={`${row.id}-${version}`}
                row={row}
                isSmallScreen={isSmallScreen}
              />
            ))}
            {endIndex < data.length && (
              <tr style={{ height: `${(data.length - endIndex) * ROW_HEIGHT}px` }} />
            )}

            {(isFetchingNextPage || hasNextPage) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4">
                  <div className="flex h-full items-center justify-center">
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
