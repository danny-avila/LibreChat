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
import { useMediaQuery, useLocalize } from '~/hooks';
import { DataTableSearch } from './DataTableSearch';
import { cn, logger } from '~/utils';
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
    virtualization: {
      overscan = 10,
      minRows = 50,
      rowHeight = 56,
      fastOverscanMultiplier = 4,
    } = {},
  } = config || {};

  const virtualizationActive = data.length >= minRows;

  // Dynamic overscan for fast scrolling - increases rendered rows during rapid scroll
  const [dynamicOverscan, setDynamicOverscan] = useState(overscan);
  const lastScrollTopRef = useRef(0);
  const lastScrollTimeRef = useRef(performance.now());
  const fastScrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setDynamicOverscan(overscan);
  }, [overscan]);

  useEffect(() => {
    return () => {
      if (fastScrollTimeoutRef.current) {
        clearTimeout(fastScrollTimeoutRef.current);
      }
    };
  }, []);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
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

  // Mobile column visibility: columns with desktopOnly meta are hidden via CSS on mobile
  // but remain in DOM for accessibility. CSS classes handle visual hiding.
  const calculatedVisibility = useMemo(() => {
    const newVisibility: VisibilityState = {};

    columns.forEach((col) => {
      const meta = (col as { meta?: { desktopOnly?: boolean } }).meta;
      if (!meta?.desktopOnly) return;

      const rawId =
        (col as { id?: string | number; accessorKey?: string | number }).id ??
        (col as { accessorKey?: string | number }).accessorKey;

      if ((typeof rawId === 'string' || typeof rawId === 'number') && String(rawId).length > 0) {
        newVisibility[String(rawId)] = true;
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

  // Warn about missing row IDs - only once per component lifecycle
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
      enableResizing: false,
      header: () => {
        const extraCheckboxProps = (isIndeterminate ? { indeterminate: true } : {}) as Record<
          string,
          unknown
        >;
        return (
          <div
            className="flex h-full items-center justify-center"
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
            aria-label={localize(`com_ui_select_row`, { 0: rowDescription })}
          >
            <SelectionCheckbox
              checked={row.getIsSelected()}
              onChange={(value) => row.toggleSelected(value)}
              ariaLabel={localize(`com_ui_select_row`, { 0: rowDescription })}
            />
          </div>
        );
      },
      meta: {
        className: 'max-w-[20px] flex-1',
      },
    };

    return [selectColumn, ...columns.map((col) => col as unknown as ColumnDef<TData, TValue>)];
  }, [
    columns,
    enableRowSelection,
    showCheckboxes,
    localize,
    data,
    getRowId,
    isAllSelected,
    isIndeterminate,
    setOptimizedRowSelection,
  ]);

  const sizedColumns = tableColumns;

  const table = useReactTable<TData>({
    data,
    columns: sizedColumns,
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
    enabled: virtualizationActive,
    count: data.length,
    getScrollElement: () => tableContainerRef.current,
    getItemKey: (index) => getRowId(data[index] as TData, index),
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan: dynamicOverscan,
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

  // Render table body based on loading state and virtualization
  let tableBodyContent: React.ReactNode;
  if (showSkeletons) {
    tableBodyContent = (
      <SkeletonRows
        count={skeletonCount}
        columns={tableColumns as ColumnDef<Record<string, unknown>>[]}
      />
    );
  } else if (virtualizationActive) {
    tableBodyContent = (
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
              row={row as unknown as Row<Record<string, unknown>>}
              virtualIndex={virtualRow.index}
              selected={row.getIsSelected()}
              style={{ height: rowHeight }}
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
    );
  } else {
    tableBodyContent = rows.map((row) => (
      <MemoizedTableRow
        key={getRowId(row.original as TData, row.index)}
        row={row as unknown as Row<Record<string, unknown>>}
        virtualIndex={row.index}
        selected={row.getIsSelected()}
        style={{ height: rowHeight }}
      />
    ));
  }

  useEffect(() => {
    setSearchTerm(filterValue);
  }, [filterValue]);

  useEffect(() => {
    if (debouncedTerm !== filterValue && onFilterChange) {
      onFilterChange(debouncedTerm);
      setOptimizedRowSelection({});
    }
  }, [debouncedTerm, filterValue, onFilterChange, setOptimizedRowSelection]);

  // Recalculate virtual range when data or state changes
  useEffect(() => {
    if (!virtualizationActive) return;
    rowVirtualizer.calculateRange();
  }, [data.length, finalSorting, columnVisibility, virtualizationActive, rowVirtualizer]);

  // Recalculate when container is resized
  useEffect(() => {
    if (!virtualizationActive) return;
    const container = tableContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      rowVirtualizer.calculateRange();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [virtualizationActive, rowVirtualizer]);

  const handleScroll = useMemo(() => {
    let rafId: number | null = null;
    let timeoutId: number | null = null;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);

      rafId = requestAnimationFrame(() => {
        const container = tableContainerRef.current;
        if (container) {
          const now = performance.now();
          const delta = Math.abs(container.scrollTop - lastScrollTopRef.current);
          const dt = now - lastScrollTimeRef.current;
          if (dt > 0) {
            const velocity = delta / dt;
            // Increase overscan during fast scrolling for smoother experience
            if (velocity > 2 && virtualizationActive && dynamicOverscan === overscan) {
              if (fastScrollTimeoutRef.current) {
                window.clearTimeout(fastScrollTimeoutRef.current);
              }
              setDynamicOverscan(Math.min(overscan * fastOverscanMultiplier, overscan * 8));
              fastScrollTimeoutRef.current = window.setTimeout(() => {
                setDynamicOverscan((current) => (current !== overscan ? overscan : current));
              }, 160);
            }
          }
          lastScrollTopRef.current = container.scrollTop;
          lastScrollTimeRef.current = now;
        }

        if (timeoutId) clearTimeout(timeoutId);

        // Trigger infinite scroll pagination
        timeoutId = window.setTimeout(() => {
          const loaderContainer = tableContainerRef.current;
          if (!loaderContainer || !fetchNextPage || !hasNextPage || isFetchingNextPage) return;

          const { scrollTop, scrollHeight, clientHeight } = loaderContainer;
          if (scrollTop + clientHeight >= scrollHeight - 200) {
            fetchNextPage().finally();
          }
        }, 100);
      });
    };
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    overscan,
    fastOverscanMultiplier,
    virtualizationActive,
    dynamicOverscan,
  ]);

  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      cleanupTimers();
    };
  }, [handleScroll, cleanupTimers]);

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
      <div className="flex w-full shrink-0 items-center gap-2 border-b border-border-light md:gap-3">
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
        <Table
          role="table"
          aria-label={localize('com_ui_data_table')}
          aria-rowcount={data.length}
          className="table-auto"
          unwrapped={true}
        >
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isDesktopOnly =
                    (header.column.columnDef.meta as { desktopOnly?: boolean } | undefined)
                      ?.desktopOnly ?? false;

                  if (!header.column.getIsVisible()) {
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

                  const metaWidth = (header.column.columnDef.meta as { width?: number } | undefined)
                    ?.width;
                  const widthStyle = isSelectHeader
                    ? { width: '32px', maxWidth: '32px', minWidth: '32px' }
                    : metaWidth && metaWidth >= 1 && metaWidth <= 100
                      ? {
                          width: `${metaWidth}%`,
                          maxWidth: `${metaWidth}%`,
                          minWidth: `${metaWidth}%`,
                        }
                      : {};
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      className={cn(
                        'border-b border-border-light px-2 py-2 md:px-3 md:py-2',
                        isSelectHeader && 'px-0 text-center',
                        canSort && 'cursor-pointer hover:bg-surface-tertiary',
                        meta?.className,
                        header.column.getIsResizing() && 'bg-surface-tertiary/60',
                        isDesktopOnly && 'hidden md:table-cell',
                      )}
                      style={widthStyle}
                      onClick={header.column.getToggleSortingHandler()}
                      onKeyDown={handleSortingKeyDown}
                      role={canSort ? 'button' : undefined}
                      tabIndex={canSort ? 0 : undefined}
                      aria-label={sortAriaLabel}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {isSelectHeader ? (
                        flexRender(header.column.columnDef.header, header.getContext())
                      ) : (
                        <div className="flex items-center gap-1 md:gap-2">
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
            {tableBodyContent}
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
