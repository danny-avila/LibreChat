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
  type Row,
  type Table as TTable,
} from '@tanstack/react-table';
import type { DataTableProps, ProcessedDataRow } from './DataTable.types';
import { SelectionCheckbox, MemoizedTableRow, SkeletonRows } from './DataTableComponents';
import { Table, TableBody, TableHead, TableHeader, TableCell, TableRow } from '../Table';
import { useDebounced, useOptimizedRowSelection } from './DataTable.hooks';
import { DataTableErrorBoundary } from './DataTableErrorBoundary';
import { useMediaQuery, useLocalize } from '~/hooks';
import { DataTableSearch } from './DataTableSearch';
import { cn, logger } from '~/utils';
import { Button } from '../Button';
import { Label } from '../Label';
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
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const scrollRAFRef = useRef<number | null>(null);

  const {
    selection: { enableRowSelection = true, showCheckboxes = true } = {},
    search: { enableSearch = true, debounce: debounceDelay = 300 } = {},
    skeleton: { count: skeletonCount = 10 } = {},
    virtualization: { overscan = 10 } = {},
  } = config || {};

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState(filterValue);
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort);

  const selectedCount = Object.keys(optimizedRowSelection).length;
  const isAllSelected = useMemo(
    () => data.length > 0 && selectedCount === data.length,
    [data.length, selectedCount],
  );
  const isIndeterminate = selectedCount > 0 && !isAllSelected;

  const getRowId = useCallback(
    (row: TData, index?: number) => String(row.id ?? `row-${index ?? 0}`),
    [],
  );

  const selectedRows = useMemo(() => {
    if (Object.keys(optimizedRowSelection).length === 0) return [];

    const dataMap = new Map(data.map((item, index) => [getRowId(item, index), item]));
    return Object.keys(optimizedRowSelection)
      .map((id) => dataMap.get(id))
      .filter(Boolean) as TData[];
  }, [optimizedRowSelection, data, getRowId]);

  const cleanupTimers = useCallback(() => {
    if (scrollRAFRef.current) {
      cancelAnimationFrame(scrollRAFRef.current);
      scrollRAFRef.current = null;
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, []);

  const debouncedTerm = useDebounced(searchTerm, debounceDelay);
  const finalSorting = sorting ?? internalSorting;

  const calculatedVisibility = useMemo(() => {
    const newVisibility: VisibilityState = {};
    columns.forEach((col) => {
      const meta = (col as { meta?: { desktopOnly?: boolean } }).meta;
      if (!meta?.desktopOnly) return;

      const rawId =
        (col as { id?: string | number; accessorKey?: string | number }).id ??
        (col as { accessorKey?: string | number }).accessorKey;

      if ((typeof rawId === 'string' || typeof rawId === 'number') && String(rawId).length > 0) {
        newVisibility[String(rawId)] = !isSmallScreen;
      } else {
        logger.warn(
          'DataTable: A desktopOnly column is missing id/accessorKey; cannot control header visibility automatically.',
          col,
        );
      }
    });
    return newVisibility;
  }, [isSmallScreen, columns]);

  useEffect(() => {
    setColumnVisibility((prev) => ({ ...prev, ...calculatedVisibility }));
  }, [calculatedVisibility]);

  const hasWarnedAboutMissingIds = useRef(false);

  useEffect(() => {
    if (data.length > 0 && !hasWarnedAboutMissingIds.current) {
      const missing = data.filter((item) => item.id === null || item.id === undefined);
      if (missing.length > 0) {
        logger.warn(
          `DataTable Warning: ${missing.length} data rows are missing a unique "id" property. Using index as a fallback. This can lead to unexpected behavior with selection and sorting.`,
          { missingCount: missing.length, sample: missing.slice(0, 3) },
        );
        hasWarnedAboutMissingIds.current = true;
      }
    }
  }, [data]);

  const tableColumns = useMemo((): ColumnDef<TData, TValue>[] => {
    if (!enableRowSelection || !showCheckboxes) {
      return columns.map((col) => col as unknown as ColumnDef<TData, TValue>);
    }

    const selectColumn: ColumnDef<TData, TValue> = {
      id: 'select',
      header: () => {
        const extraCheckboxProps = (isIndeterminate ? { indeterminate: true } : {}) as Record<
          string,
          unknown
        >;
        return (
          <div
            className="flex h-full items-center justify-center"
            role="button"
            tabIndex={0}
            aria-label={localize('com_ui_select_all')}
          >
            <SelectionCheckbox
              checked={isAllSelected}
              onChange={(value) => {
                if (isAllSelected || !value) {
                  setOptimizedRowSelection({});
                } else {
                  const allSelection = data.reduce<Record<string, boolean>>((acc, item, index) => {
                    acc[getRowId(item, index)] = true;
                    return acc;
                  }, {});
                  setOptimizedRowSelection(allSelection);
                }
              }}
              ariaLabel={localize('com_ui_select_all')}
              {...extraCheckboxProps}
            />
          </div>
        );
      },
      cell: ({ row }) => {
        const rowDescription = row.original.name
          ? `named ${row.original.name}`
          : `at position ${row.index + 1}`;
        return (
          <div
            className="flex h-full items-center justify-center"
            role="button"
            tabIndex={0}
            aria-label={localize(`com_ui_select_row`, { rowDescription })}
          >
            <SelectionCheckbox
              checked={row.getIsSelected()}
              onChange={(value) => row.toggleSelected(value)}
              ariaLabel={localize(`com_ui_select_row`, { rowDescription })}
            />
          </div>
        );
      },
      meta: {
        className: 'w-12',
      },
    };

    return [selectColumn, ...columns.map((col) => col as unknown as ColumnDef<TData, TValue>)];
  }, [columns, enableRowSelection, showCheckboxes, localize]);

  const table = useReactTable<TData>({
    data,
    columns: tableColumns,
    getRowId: getRowId,
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
    count: data.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback(() => 60, []),
    overscan,
    measureElement:
      typeof window !== 'undefined'
        ? (element) => element?.getBoundingClientRect().height ?? 60
        : undefined,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0;

  const { rows } = table.getRowModel();
  const headerGroups = table.getHeaderGroups();

  const showSkeletons = isLoading || (isFetching && !isFetchingNextPage);
  const shouldShowSearch = enableSearch && onFilterChange;

  // useEffect(() => {
  //   if (data.length > 1000) {
  //     const cleanup = setTimeout(() => {
  //       rowVirtualizer.scrollToIndex(0, { align: 'start' });
  //       rowVirtualizer.measure();
  //     }, 1000);
  //     return () => clearTimeout(cleanup);
  //   }
  // }, [data.length, rowVirtualizer]);

  useEffect(() => {
    setSearchTerm(filterValue);
  }, [filterValue]);

  useEffect(() => {
    if (debouncedTerm !== filterValue && onFilterChange) {
      onFilterChange(debouncedTerm);
      setOptimizedRowSelection({});
    }
  }, [debouncedTerm, filterValue, onFilterChange, setOptimizedRowSelection]);

  const handleScroll = useMemo(() => {
    let rafId: number | null = null;
    let timeoutId: number | null = null;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        if (timeoutId) clearTimeout(timeoutId);

        timeoutId = window.setTimeout(() => {
          const container = tableContainerRef.current;
          if (!container || !fetchNextPage || !hasNextPage || isFetchingNextPage) return;

          const { scrollTop, scrollHeight, clientHeight } = container;
          if (scrollTop + clientHeight >= scrollHeight - 200) {
            fetchNextPage().finally();
          }
        }, 100);
      });
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      cleanupTimers();
    };
  }, [handleScroll, cleanupTimers]);

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
          <Button onClick={handleReset}>{localize('com_ui_retry')}</Button>
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
      role="region"
      aria-label={localize('com_ui_data_table')}
    >
      <div className="flex w-full shrink-0 items-center gap-3 border-b border-border-light">
        {shouldShowSearch && <DataTableSearch value={searchTerm} onChange={setSearchTerm} />}
        {customActionsRenderer &&
          customActionsRenderer({
            selectedCount,
            selectedRows,
            table: table as unknown as TTable<ProcessedDataRow<TData>>,
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
        role="region"
        aria-label={localize('com_ui_data_table_scroll_area')}
        aria-describedby={showSkeletons ? 'loading-status' : undefined}
      >
        <Table role="table" aria-label={localize('com_ui_data_table')}>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isDesktopOnly =
                    (header.column.columnDef.meta as { desktopOnly?: boolean } | undefined)
                      ?.desktopOnly ?? false;

                  if (!header.column.getIsVisible() || (isSmallScreen && isDesktopOnly)) {
                    return null;
                  }

                  const isSelectHeader = header.id === 'select';
                  const meta = header.column.columnDef.meta as { className?: string } | undefined;
                  const canSort = header.column.getCanSort();
                  let sortAriaLabel: string | undefined;
                  if (canSort) {
                    const sortState = header.column.getIsSorted();
                    let sortStateLabel = 'sortable';
                    if (sortState === 'asc') {
                      sortStateLabel = 'ascending';
                    } else if (sortState === 'desc') {
                      sortStateLabel = 'descending';
                    }

                    const headerLabel =
                      typeof header.column.columnDef.header === 'string'
                        ? header.column.columnDef.header
                        : header.column.id;

                    sortAriaLabel = `${headerLabel ?? ''} column, ${sortStateLabel}`;
                  }

                  const handleSortingKeyDown = (e: React.KeyboardEvent) => {
                    if (canSort && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      header.column.toggleSorting();
                    }
                  };

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'border-b border-border-light py-2',
                        isSelectHeader ? 'px-0 text-center' : 'px-3',
                        canSort && 'cursor-pointer hover:bg-surface-tertiary',
                        meta?.className,
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                      onKeyDown={handleSortingKeyDown}
                      role={canSort ? 'button' : undefined}
                      tabIndex={canSort ? 0 : undefined}
                      aria-label={sortAriaLabel}
                      aria-sort={
                        header.column.getIsSorted() as
                          | 'ascending'
                          | 'descending'
                          | 'none'
                          | undefined
                      }
                    >
                      {isSelectHeader ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-text-primary" aria-hidden="true">
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
                columns={tableColumns as ColumnDef<Record<string, unknown>>[]}
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
                      key={`${virtualRow.key}-${row.getIsSelected() ? 'selected' : 'unselected'}`}
                      row={row as unknown as Row<TData>}
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
                <TableCell
                  colSpan={tableColumns.length}
                  className="p-4 text-center"
                  id="loading-status"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Spinner className="h-5 w-5" aria-hidden="true" />
                    <span className="sr-only">{localize('com_ui_loading_more_data')}</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {!isLoading && !showSkeletons && rows.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-12"
            role="status"
            aria-live="polite"
          >
            <Label className="text-center text-text-secondary">
              {searchTerm ? localize('com_ui_no_search_results') : localize('com_ui_no_data')}
            </Label>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataTable;
