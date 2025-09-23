import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown, ArrowDownUp } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
  type ColumnDef,
  type CellContext,
  type Row,
} from '@tanstack/react-table';
import type { DataTableProps } from './DataTable.types';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableCell,
  TableRow,
  Button,
  Label,
} from '~/components';
import { SelectionCheckbox, MemoizedTableRow, SkeletonRows } from './DataTableComponents';
import { useDebounced, useOptimizedRowSelection } from './DataTable.hooks';
import { DataTableErrorBoundary } from './DataTableErrorBoundary';
import { DataTableSearch } from './DataTableSearch';
import { useMediaQuery, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { cn, logger } from '~/utils';
import { Spinner } from '~/svgs';

function DataTable<TData extends Record<string, unknown>, TValue>({
  columns,
  data,
  className = '',
  isLoading = false,
  isFetching = false,
  config,
  filterValue = '',
  onFilterChange,
  defaultSort = [],
  isFetchingNextPage = false,
  hasNextPage = false,
  fetchNextPage,
  onReset,
  sorting,
  onSortingChange,
  customActionsRenderer,
}: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const scrollRAFRef = useRef<number | null>(null);

  const {
    selection: { enableRowSelection = true, showCheckboxes = true } = {},
    search: { enableSearch = true, debounce: debounceDelay = 300 } = {},
    skeleton: { count: skeletonCount = 10 } = {},
    virtualization: { overscan = 5 } = {},
  } = config || {};

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState(filterValue);
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort);
  const [isScrollingFetching, setIsScrollingFetching] = useState(false);

  const debouncedTerm = useDebounced(searchTerm, debounceDelay);
  const finalSorting = sorting ?? internalSorting;

  // Memoize column visibility calculations
  const calculatedVisibility = useMemo(() => {
    const newVisibility: VisibilityState = {};
    if (isSmallScreen) {
      columns.forEach((col: ColumnDef<TData, TValue> & { meta?: { hideOnMobile?: boolean } }) => {
        if (col.id && col.meta?.hideOnMobile) {
          newVisibility[col.id] = false;
        }
      });
    }
    return newVisibility;
  }, [isSmallScreen, columns]);

  useEffect(() => {
    setColumnVisibility(calculatedVisibility);
  }, [calculatedVisibility]);

  const processedData = useMemo(
    () =>
      data.map((item, index) => {
        if (item.id === null || item.id === undefined) {
          logger.warn(
            'DataTable Warning: A data row is missing a unique "id" property. Using index as a fallback. This can lead to unexpected behavior with selection and sorting.',
            item,
          );
        }

        return {
          ...item,
          _index: index,
          _id: String(item.id ?? `row-${index}`),
        };
      }),
    [data],
  );

  // Enhanced columns with desktop-only cell rendering
  const enhancedColumns = useMemo(() => {
    return columns.map((col) => {
      const originalCol = col as ColumnDef<TData, TValue> & {
        meta?: {
          hideOnMobile?: boolean;
          desktopOnly?: boolean;
          className?: string;
        };
      };

      if (originalCol.meta?.desktopOnly && originalCol.cell) {
        const originalCell = originalCol.cell;
        return {
          ...originalCol,
          cell: (props: CellContext<TData, TValue>) => {
            if (!isDesktop) {
              return null;
            }
            return typeof originalCell === 'function' ? originalCell(props) : originalCell;
          },
        };
      }
      return originalCol;
    });
  }, [columns, isDesktop]);

  const tableColumns = useMemo(() => {
    if (!enableRowSelection || !showCheckboxes) {
      return enhancedColumns as ColumnDef<TData & { _id: string }, TValue>[];
    }

    const selectColumn: ColumnDef<TData & { _id: string }, boolean> = {
      id: 'select',
      header: ({ table }) => (
        <div className="flex h-full items-center justify-center">
          <SelectionCheckbox
            checked={table.getIsAllRowsSelected()}
            onChange={(value) => table.toggleAllRowsSelected(value)}
            ariaLabel={localize('com_ui_select_all' as string)}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex h-full items-center justify-center">
          <SelectionCheckbox
            checked={row.getIsSelected()}
            onChange={(value) => row.toggleSelected(value)}
            ariaLabel={`Select row ${row.index + 1}`}
          />
        </div>
      ),
      meta: {
        className: 'w-12',
      },
    };

    return [
      selectColumn,
      ...(enhancedColumns as ColumnDef<TData & { _id: string }, TValue>[]),
    ] as ColumnDef<TData & { _id: string }, TValue>[];
  }, [enhancedColumns, enableRowSelection, showCheckboxes, localize]);

  const table = useReactTable<TData & { _id: string }>({
    data: processedData,
    columns: tableColumns,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection,
    enableMultiRowSelection: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      sorting: finalSorting,
      columnVisibility,
      rowSelection: optimizedRowSelection,
    },
    onSortingChange: onSortingChange ?? setInternalSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setOptimizedRowSelection,
  });

  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback(() => 50, []),
    overscan,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height ?? 50
        : undefined,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  const { rows } = table.getRowModel();
  const headerGroups = table.getHeaderGroups();
  const selectedCount = Object.keys(optimizedRowSelection).length;

  const showSkeletons = isLoading || (isFetching && !isFetchingNextPage);
  const shouldShowSearch = enableSearch && onFilterChange;

  useEffect(() => {
    setSearchTerm(filterValue);
  }, [filterValue]);

  useEffect(() => {
    if (debouncedTerm !== filterValue && onFilterChange) {
      onFilterChange(debouncedTerm);
      setOptimizedRowSelection({});
    }
  }, [debouncedTerm, filterValue, onFilterChange, setOptimizedRowSelection]);

  // Optimized scroll handler with RAF
  const handleScroll = useCallback(() => {
    if (scrollRAFRef.current !== null) {
      cancelAnimationFrame(scrollRAFRef.current);
    }

    scrollRAFRef.current = requestAnimationFrame(() => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = window.setTimeout(() => {
        if (
          !fetchNextPage ||
          !hasNextPage ||
          isFetchingNextPage ||
          isScrollingFetching ||
          !tableContainerRef.current
        ) {
          return;
        }

        const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;
        const scrollBottom = scrollTop + clientHeight;
        const threshold = scrollHeight - 200;

        if (scrollBottom >= threshold) {
          setIsScrollingFetching(true);
          fetchNextPage().finally(() => {
            setIsScrollingFetching(false);
          });
        }

        scrollTimeoutRef.current = null;
      }, 150); // Slightly increased debounce for better performance

      scrollRAFRef.current = null;
    });
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isScrollingFetching]);

  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current);
      }
    };
  }, [handleScroll]);

  const handleReset = useCallback(() => {
    setError(null);
    setOptimizedRowSelection({});
    setSearchTerm('');
    onReset?.();
  }, [onReset, setOptimizedRowSelection]);

  if (error) {
    return (
      <DataTableErrorBoundary onReset={handleReset}>
        <div className="flex flex-col items-center justify-center p-8">
          <p className="mb-4 text-red-500">{error.message}</p>
          <Button onClick={handleReset}>{localize('com_ui_retry' as string)}</Button>
        </div>
      </DataTableErrorBoundary>
    );
  }

  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-lg border border-border-light bg-background',
        'h-[calc(100vh-8rem)] max-h-[80vh]',
        className,
      )}
    >
      <div className="flex w-full shrink-0 items-center gap-3 border-b border-border-light">
        {shouldShowSearch && <DataTableSearch value={searchTerm} onChange={setSearchTerm} />}
        {customActionsRenderer &&
          customActionsRenderer({
            selectedCount,
            selectedRows: table.getSelectedRowModel().rows.map((r) => r.original),
            table,
            showToast,
          })}
      </div>

      <div
        ref={tableContainerRef}
        className="overflow-anchor-none relative min-h-0 flex-1 overflow-auto will-change-scroll"
        style={
          {
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          } as React.CSSProperties
        }
      >
        <Table className="w-full">
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSelectHeader = header.id === 'select';
                  const meta = header.column.columnDef.meta as { className?: string } | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'border-b border-border-light py-2',
                        isSelectHeader ? 'px-0 text-center' : 'px-3',
                        header.column.getCanSort() && 'cursor-pointer hover:bg-surface-tertiary',
                        meta?.className,
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {isSelectHeader ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-text-primary">
                              {{
                                asc: <ArrowUp className="size-4 text-text-primary" />,
                                desc: <ArrowDown className="size-4 text-text-primary" />,
                              }[header.column.getIsSorted() as string] ?? (
                                <ArrowDownUp className="size-4 text-text-primary" />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {showSkeletons ? (
              <SkeletonRows
                count={skeletonCount}
                columns={tableColumns}
                containerRef={tableContainerRef}
              />
            ) : (
              <>
                {paddingTop > 0 && (
                  <TableRow aria-hidden="true">
                    <TableCell
                      colSpan={tableColumns.length}
                      style={{ height: paddingTop, padding: 0, border: 0 }}
                    />
                  </TableRow>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <MemoizedTableRow
                      key={virtualRow.key}
                      row={row as Row<TData & { _id: string }>}
                      columns={tableColumns}
                      index={virtualRow.index}
                      virtualIndex={virtualRow.index}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <TableRow aria-hidden="true">
                    <TableCell
                      colSpan={tableColumns.length}
                      style={{ height: paddingBottom, padding: 0, border: 0 }}
                    />
                  </TableRow>
                )}
              </>
            )}
            {isFetchingNextPage && (
              <TableRow>
                <TableCell colSpan={tableColumns.length} className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Spinner className="h-5 w-5" />
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {!isLoading && !showSkeletons && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Label className="text-center text-text-secondary">
              {searchTerm ? 'No search results' : localize('com_ui_no_data')}
            </Label>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
