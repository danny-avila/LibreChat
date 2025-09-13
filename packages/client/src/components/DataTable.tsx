import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  useMemo,
  startTransition,
  CSSProperties,
} from 'react';
import { ArrowUp, ArrowDownUp } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Row,
  Column,
  ColumnDef,
  flexRender,
  SortingState,
  useReactTable,
  getCoreRowModel,
  VisibilityState,
  getSortedRowModel,
  ColumnFiltersState,
  getFilteredRowModel,
  ColumnPinningState,
} from '@tanstack/react-table';
import type { Table as TTable } from '@tanstack/react-table';
import { Table, TableRow, TableBody, TableCell, TableHead, TableHeader } from './Table';
import DataTableErrorBoundary from './DataTable/DataTableErrorBoundary';
import AnimatedSearchInput from './AnimatedSearchInput';
import { useMediaQuery, useLocalize } from '~/hooks';
import { TrashIcon, Spinner } from '~/svgs';
import { Skeleton } from './Skeleton';
import { Checkbox } from './Checkbox';
import { Button } from './Button';
import { cn } from '~/utils';

interface PrevProps {
  defaultSort: SortingState;
  dataLength: number;
  columnsLength: number;
  filterValue: string;
  sortingLength?: number;
}

// Constants extracted for maintainability
export const DATA_TABLE_CONSTANTS = {
  // Selection and checkbox dimensions
  CHECKBOX_WIDTH: '30px' as const,
  SELECT_COLUMN_SIZE: '50px' as const,
  SELECT_COLUMN_MIN_WIDTH: '50px' as const,
  DELETE_BUTTON_MIN_WIDTH: '40px' as const,

  // Animation and timing
  ANIMATION_DELAY_BASE: 15 as const, // ms per row
  ANIMATION_DELAY_MAX: 300 as const, // ms cap
  SEARCH_DEBOUNCE_MS: 300 as const,
  ROW_TRANSITION_DURATION: '200ms' as const,

  // Virtual scrolling and sizing
  OVERS_CAN: 10 as const,
  ROW_HEIGHT_ESTIMATE: 50 as const, // px fallback
  INFINITE_SCROLL_THRESHOLD: 1.2 as const, // multiplier of clientHeight
  SCROLL_THROTTLE_MS: 100 as const, // throttle scroll events

  // Skeleton and layout
  SKELETON_OFFSET: 150 as const, // px added to base widths
  SEARCH_INPUT_MIN_WIDTH: '200px' as const,
  TABLE_MIN_WIDTH: '300px' as const,
  LOADING_INDICATOR_SIZE: 4 as const, // rem for spinner
  TRASH_ICON_SIZE: 3.5 as const, // rem base, 4 for sm

  // Memory management
  MAX_MEASURED_HEIGHTS: 100 as const,
  MEASURED_HEIGHTS_TRIM: 50 as const,
} as const;

// Static skeleton widths for performance - avoids random computation on every render
const STATIC_SKELETON_WIDTHS = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240];

// Column pinning utility - applies sticky positioning for pinned columns
const getCommonPinningStyles = <TData,>(
  column: Column<TData>,
  table: TTable<TData>,
): CSSProperties => {
  const isPinned = column.getIsPinned();

  if (!isPinned) {
    return {
      position: 'relative',
      width: column.getSize(),
      zIndex: 0,
    };
  }

  const leftPinnedColumns = table.getLeftLeafColumns();
  const rightPinnedColumns = table.getRightLeafColumns();

  const isLastLeftPinnedColumn =
    isPinned === 'left' &&
    leftPinnedColumns.length > 0 &&
    leftPinnedColumns[leftPinnedColumns.length - 1].id === column.id;

  const isFirstRightPinnedColumn =
    isPinned === 'right' && rightPinnedColumns.length > 0 && rightPinnedColumns[0].id === column.id;

  let boxShadow: string | undefined;
  if (isLastLeftPinnedColumn) {
    boxShadow = '-4px 0 4px -4px rgba(0, 0, 0, 0.1) inset';
  } else if (isFirstRightPinnedColumn) {
    boxShadow = '4px 0 4px -4px rgba(0, 0, 0, 0.1) inset';
  }

  // Calculate offset for pinned position
  let offset = 0;
  if (isPinned === 'left') {
    const columnIndex = leftPinnedColumns.findIndex((col) => col.id === column.id);
    offset = leftPinnedColumns.slice(0, columnIndex).reduce((sum, col) => sum + col.getSize(), 0);
  } else if (isPinned === 'right') {
    const columnIndex = rightPinnedColumns.findIndex((col) => col.id === column.id);
    offset = rightPinnedColumns.slice(columnIndex + 1).reduce((sum, col) => sum + col.getSize(), 0);
  }

  return {
    boxShadow,
    left: isPinned === 'left' ? `${offset}px` : undefined,
    right: isPinned === 'right' ? `${offset}px` : undefined,
    opacity: 0.95,
    position: 'sticky',
    width: column.getSize(),
    zIndex: 1,
    backgroundColor: 'var(--surface-secondary)',
  };
};

type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
  };
};

// Throttle utility for performance optimization - Fixed: Use DOM-safe timeout type
const throttle = <T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return ((...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      fn(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(
        () => {
          fn(...args);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime),
      );
    }
  }) as T;
};

// Deep comparison utility for objects
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        !keysB.includes(key) ||
        !deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
};

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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
        e.stopPropagation();
      }}
      className={`flex h-full ${DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH} items-center justify-center`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} aria-label={ariaLabel} />
    </div>
  ),
);

SelectionCheckbox.displayName = 'SelectionCheckbox';

// Memoized column style computation
const useColumnStyles = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  isSmallScreen: boolean,
) => {
  return useMemo(() => {
    const getColumnStyle = (column: TableColumn<TData, TValue>): React.CSSProperties => ({
      width: isSmallScreen ? column?.meta?.mobileSize : column?.meta?.size,
      minWidth: column?.meta?.minWidth,
      maxWidth: column?.meta?.size,
    });

    return columns.reduce(
      (acc, column) => {
        if (column.id) {
          acc[column.id] = getColumnStyle(column);
        }
        return acc;
      },
      {} as Record<string, React.CSSProperties>,
    );
  }, [columns, isSmallScreen]);
};

const TableRowComponent = <TData,>({
  row,
  columnStyles,
  table,
  index,
  virtualIndex,
}: {
  row: Row<TData>;
  columnStyles: Record<string, React.CSSProperties>;
  table: TTable<TData>;
  index: number;
  virtualIndex?: number;
}) => {
  const handleSelection = useCallback(
    (value: boolean) => {
      startTransition(() => {
        row.toggleSelected(value);
      });
    },
    [row],
  );

  return (
    <TableRow
      data-state={row.getIsSelected() ? 'selected' : undefined}
      data-index={virtualIndex} // For dynamic measurement
      className="motion-safe:animate-fadeIn border-b border-border-light transition-all duration-200 ease-out hover:bg-surface-secondary"
    >
      {row.getVisibleCells().map((cell) => {
        if (cell.column.id === 'select') {
          return (
            <TableCell key={cell.id} className="px-2 py-1 transition-colors duration-200">
              <SelectionCheckbox
                checked={row.getIsSelected()}
                onChange={handleSelection}
                ariaLabel={`Select row ${index + 1}`}
              />
            </TableCell>
          );
        }

        if (cell.column.id === 'title') {
          return (
            <TableHead
              key={cell.id}
              className="w-0 max-w-0 px-2 py-1 align-middle text-xs transition-all duration-300 sm:px-4 sm:py-2 sm:text-sm"
              style={getColumnStyle(
                cell.column.columnDef as TableColumn<TData, TValue>,
                isSmallScreen,
              )}
              scope="row"
            >
              <div className="overflow-hidden text-ellipsis">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            </TableHead>
          );
        }

        return (
          <TableCell
            key={cell.id}
            className="w-0 max-w-0 px-2 py-1 align-middle text-xs transition-colors duration-200 sm:px-4 sm:py-2 sm:text-sm"
            style={{
              ...columnStyles[cell.column.id],
              ...getCommonPinningStyles(cell.column, table),
            }}
          >
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
};

const MemoizedTableRow = memo(TableRowComponent) as typeof TableRowComponent;

const DeleteButton = memo(
  ({
    onDelete,
    isDeleting,
    disabled,
    isSmallScreen,
    ariaLabel,
  }: {
    onDelete?: () => Promise<void>;
    isDeleting: boolean;
    disabled: boolean;
    isSmallScreen: boolean;
    ariaLabel: string;
  }) => {
    if (!onDelete) return null;

    return (
      <Button
        variant="outline"
        onClick={onDelete}
        disabled={disabled}
        className={cn(
          `min-w-[${DATA_TABLE_CONSTANTS.DELETE_BUTTON_MIN_WIDTH}] transition-all ${DATA_TABLE_CONSTANTS.ROW_TRANSITION_DURATION} hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20`,
          isSmallScreen && 'px-2 py-1',
        )}
        aria-label={isDeleting ? 'Deleting selected rows' : 'Delete selected rows'}
      >
        {isDeleting ? (
          <Spinner className={`size-${DATA_TABLE_CONSTANTS.LOADING_INDICATOR_SIZE}`} />
        ) : (
          <>
            <TrashIcon
              className={`size-${DATA_TABLE_CONSTANTS.TRASH_ICON_SIZE} text-red-500 sm:size-4`}
            />
            {!isSmallScreen && <span className="ml-2">Delete</span>}
          </>
        )}
      </Button>
    );
  },
);

DeleteButton.displayName = 'DeleteButton';

// Memoized skeleton rows with static precomputed widths for optimal performance
const SkeletonRows = memo(function <TData, TValue>({
  count = 10,
  columns,
  columnStyles,
}: {
  count?: number;
  columns: TableColumn<TData, TValue>[];
  columnStyles: Record<string, React.CSSProperties>;
}) {
  // Use static shuffled widths to avoid random computation; slice based on count
  const skeletonWidths = useMemo(() => {
    // Pre-shuffle once at component level for consistency across renders
    const shuffled = [...STATIC_SKELETON_WIDTHS].sort(() => Math.random() - 0.5);
    return shuffled
      .slice(0, Math.min(count, shuffled.length))
      .map((w) => w + DATA_TABLE_CONSTANTS.SKELETON_OFFSET);
  }, [count]);

  if (!columns.length || !columns[0]?.id) return null;
  const firstDataColumnIndex = columns[0].id === 'select' ? 1 : 0;

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableRow key={`skeleton-${index}`} className="border-b border-border-light">
          {columns.map((column, columnIndex) => {
            const style = columnStyles[column.id!] || {};
            const isFirstDataColumn = columnIndex === firstDataColumnIndex;
            const width = isFirstDataColumn
              ? (skeletonWidths[index % skeletonWidths.length] ?? undefined)
              : undefined;

            return (
              <TableCell key={column.id} className="px-2 py-1 sm:px-4 sm:py-2" style={style}>
                <Skeleton
                  className="h-6 animate-pulse"
                  style={{ width: width ? `${width}px` : '100%' }}
                />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
});

SkeletonRows.displayName = 'SkeletonRows';

/**
 * Comprehensive configuration object for DataTable features.
 * Consolidates all individual props into nested sections for better maintainability and type safety.
 *
 * @example
 * const config = {
 *   selection: { enableRowSelection: true, showCheckboxes: false },
 *   search: { enableSearch: true, debounce: 500, filterColumn: 'name' },
 *   skeleton: { count: 5 },
 *   virtualization: { overscan: 15 },
 *   pinning: { enableColumnPinning: true }
 * };
 *
 * Defaults: enableRowSelection: true, showCheckboxes: true, enableSearch: true,
 * skeleton.count: 10, virtualization.overscan: 10, search.debounce: 300,
 * pinning.enableColumnPinning: false
 */
interface DataTableConfig {
  /**
   * Selection configuration for row selection features.
   * Controls checkbox visibility and row selection behavior.
   */
  selection?: {
    /**
     * Enable row selection functionality across the table.
     * When true, rows can be selected via checkboxes or keyboard navigation.
     * @default true
     */
    enableRowSelection?: boolean;

    /**
     * Show checkboxes in the first column for row selection.
     * Requires enableRowSelection to be true. Affects both header (select all) and row-level checkboxes.
     * @default true
     */
    showCheckboxes?: boolean;
  };

  /**
   * Search configuration for filtering functionality.
   * Enables search input with debounced filtering on specified column.
   */
  search?: {
    /**
     * Enable search input and filtering capabilities.
     * When true, displays AnimatedSearchInput above the table for filtering data.
     * Requires filterColumn to be specified for column-specific filtering.
     * @default true
     */
    enableSearch?: boolean;

    /**
     * Debounce delay for search input in milliseconds.
     * Controls how long to wait after user stops typing before filtering the table.
     * Higher values reduce re-renders but may feel less responsive.
     * @default 300
     */
    debounce?: number;

    /**
     * Column key to filter search results on.
     * Must match a column accessorKey. Search will filter rows where this column's value contains the search term.
     * Required when enableSearch is true.
     * @example 'name', 'email', 'id'
     */
    filterColumn?: string;
  };

  /**
   * Skeleton configuration for loading states.
   * Controls the number of skeleton rows shown while data is loading.
   */
  skeleton?: {
    /**
     * Number of skeleton rows to display during initial loading or data fetching.
     * Skeleton rows provide visual feedback and maintain table layout consistency.
     * @default 10
     */
    count?: number;
  };

  /**
   * Virtualization configuration for scroll performance.
   * Controls virtual scrolling behavior for large datasets.
   */
  virtualization?: {
    /**
     * Number of additional rows to render outside the visible viewport.
     * Higher values improve scroll smoothness but increase memory usage.
     * Recommended range: 5-20 depending on row complexity and dataset size.
     * @default 10
     */
    overscan?: number;
  };

  /**
   * Column pinning configuration for sticky column behavior.
   * Controls whether columns can be pinned to left or right side of the table.
   */
  pinning?: {
    /**
     * Enable column pinning functionality.
     * When true, columns can be pinned to the left or right side of the table.
     * Pinned columns remain visible during horizontal scrolling.
     * @default false
     */
    enableColumnPinning?: boolean;
  };
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Optimized row selection state with deep comparison
const useOptimizedRowSelection = (initialSelection: Record<string, boolean> = {}) => {
  const [selection, setSelection] = useState(initialSelection);

  const optimizedSelection = useMemo(() => {
    return Object.keys(selection).length > 0 ? selection : {};
  }, [selection]);

  const setOptimizedSelection = useCallback(
    (
      newSelection:
        | Record<string, boolean>
        | ((prev: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      setSelection((prev) => {
        const next = typeof newSelection === 'function' ? newSelection(prev) : newSelection;
        return deepEqual(prev, next) ? prev : next;
      });
    },
    [],
  );

  return [optimizedSelection, setOptimizedSelection] as const;
};

interface DataTableProps<TData, TValue> {
  columns: TableColumn<TData, TValue>[];
  data: TData[];
  className?: string;
  isLoading?: boolean;
  isFetching?: boolean;
  /**
   * Configuration object consolidating all feature props.
   * See DataTableConfig for detailed structure and defaults.
   */
  config?: DataTableConfig;
  onDelete?: (selectedRows: TData[]) => Promise<void>;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  defaultSort?: SortingState;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => Promise<unknown>;
  onError?: (error: Error) => void;
  onReset?: () => void;
  sorting?: SortingState;
  onSortingChange?: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
}

/**
 * DataTable renders a virtualized, searchable table with selection and infinite loading.
 * Optimized for performance with memoization, virtual scrolling, and efficient state management.
 */
export default function DataTable<TData, TValue>({
  columns,
  data,
  className = '',
  isLoading = false,
  isFetching = false,
  config,
  onDelete,
  filterValue = '',
  onFilterChange,
  defaultSort = [],
  isFetchingNextPage = false,
  hasNextPage = false,
  fetchNextPage,
  onError,
  onReset,
  sorting,
  onSortingChange,
}: DataTableProps<TData, TValue>) {
  const renderCountRef = useRef(0);
  const prevPropsRef = useRef<PrevProps | null>(null);

  const tableConfig = useMemo(() => {
    return {
      enableRowSelection: config?.selection?.enableRowSelection ?? true,
      showCheckboxes: config?.selection?.showCheckboxes ?? true,
      enableSearch: config?.search?.enableSearch ?? true,
      filterColumn: config?.search?.filterColumn,
      skeletonCount: config?.skeleton?.count ?? 10,
      overscan: config?.virtualization?.overscan ?? DATA_TABLE_CONSTANTS.OVERS_CAN,
      debounceDelay: config?.search?.debounce ?? DATA_TABLE_CONSTANTS.SEARCH_DEBOUNCE_MS,
      enableColumnPinning: config?.pinning?.enableColumnPinning ?? false,
    };
  }, [config]);

  const {
    enableRowSelection,
    showCheckboxes,
    enableSearch,
    filterColumn,
    skeletonCount,
    overscan,
    debounceDelay,
    enableColumnPinning,
  } = tableConfig;

  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // State management
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
  const [term, setTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedTerm = useDebounced(term, debounceDelay);

  // Track when we're waiting for search results
  const isWaitingForSearchResults = isSearching && isFetching;
  const isFirstLoad = isLoading && data.length === 0;
  const isRefreshing = isFetching && !isFirstLoad && !isFetchingNextPage && !isSearching;

  // Show skeletons during initial load, refresh, or search
  const showSkeletons = isFirstLoad || isRefreshing || isWaitingForSearchResults;

  // External sorting support: use provided sorting state, fall back to internal
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort);
  const finalSorting = sorting ?? internalSorting;

  // Mount tracking for cleanup - Fixed: Declare mountedRef before any callback that uses it
  const mountedRef = useRef(true);

  // Sorting handler: call external callback if provided, otherwise use internal state
  const handleSortingChangeInternal = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      startTransition(() => {
        const newSorting = typeof updater === 'function' ? updater(finalSorting) : updater;
        setInternalSorting(newSorting);
        onSortingChange?.(newSorting);
      });
    },
    [finalSorting, onSortingChange],
  );
  const handleSortingChange = onSortingChange ?? handleSortingChangeInternal;

  // Diagnostic logging
  renderCountRef.current += 1;

  if (process.env.NODE_ENV === 'development') {
    console.log('DataTable: Render #', renderCountRef.current);
    console.log('DataTable: Props summary:', {
      dataLength: data?.length,
      columnsLength: columns?.length,
      defaultSort,
      sorting: sorting?.length,
      filterValue,
      isLoading,
      configKeys: config ? Object.keys(config) : null,
    });

    // Prop stability check
    if (prevPropsRef.current) {
      const prev = prevPropsRef.current;
      if (
        !Object.is(defaultSort, prev.defaultSort) ||
        data.length !== prev.dataLength ||
        columns.length !== prev.columnsLength ||
        filterValue !== prev.filterValue ||
        sorting?.length !== prev.sortingLength
      ) {
        console.log('DataTable: Key props changed since last render');
      }
    }
    prevPropsRef.current = {
      defaultSort,
      dataLength: data?.length || 0,
      columnsLength: columns?.length || 0,
      filterValue,
      sortingLength: sorting?.length || 0,
    };

    // Search UX warning for missing filterColumn
    if (enableSearch && !filterColumn && onFilterChange) {
      console.warn(
        'DataTable: enableSearch is true but filterColumn is missing. Search will be hidden.',
      );
    }
  }

  const sanitizeError = useCallback((err: Error): string => {
    const message = err.message;
    if (message?.includes('auth') || message?.includes('token')) {
      return 'Authentication failed. Please log in again.';
    }
    return process.env.NODE_ENV === 'development'
      ? message
      : 'An error occurred. Please try again.';
  }, []);

  // Memoized table columns with selection
  const tableColumns = useMemo(() => {
    if (!enableRowSelection || !showCheckboxes) return columns;

    const selectColumn: TableColumn<TData, boolean> = {
      id: 'select',
      header: ({ table }: { table: TTable<TData> }) => (
        <div
          className={`flex h-full ${DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH} items-center justify-center`}
        >
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
            aria-label="Select all rows"
          />
        </div>
      ),
      cell: ({ row }) => (
        <SelectionCheckbox
          checked={row.getIsSelected()}
          onChange={(value) => row.toggleSelected(value)}
          ariaLabel={`Select row ${row.index + 1}`}
        />
      ),
      meta: {
        size: DATA_TABLE_CONSTANTS.SELECT_COLUMN_SIZE,
        minWidth: DATA_TABLE_CONSTANTS.SELECT_COLUMN_MIN_WIDTH,
      },
    };

    return [selectColumn, ...columns];
  }, [columns, enableRowSelection, showCheckboxes]);

  // Memoized column styles for performance
  const columnStyles = useColumnStyles(tableColumns as TableColumn<TData, TValue>[], isSmallScreen);

  // Set CSS variables for column sizing - Fixed: Add SSR guard
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !tableContainerRef.current) return;

    tableColumns.forEach((column, index) => {
      if (column.id) {
        const size = columnStyles[column.id]?.width || 'auto';
        tableContainerRef.current!.style.setProperty(`--col-${index}-size`, `${size}`);
      }
    });
  }, [tableColumns, columnStyles]);

  // Memoized row data with stable references
  const memoizedRowData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      _index: index,
      _id: (item as Record<string, unknown>)?.id || index,
    }));
  }, [data]);

  // React Table instance
  const table = useReactTable({
    data: memoizedRowData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection,
    enableMultiRowSelection: true,
    enableColumnPinning,
    state: {
      sorting: finalSorting,
      columnFilters,
      columnVisibility,
      columnPinning,
      rowSelection: optimizedRowSelection,
    },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setOptimizedRowSelection,
  });

  const { rows } = table.getRowModel();

  // Fixed: Simplify header groups - React Table already memoizes internally
  const headerGroups = table.getHeaderGroups();

  // Virtual scrolling setup with optimized height measurement
  const measuredHeightsRef = useRef<number[]>([]);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: useCallback(() => {
      const heights = measuredHeightsRef.current;
      if (heights.length > 0) {
        const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
        return Math.max(avg, DATA_TABLE_CONSTANTS.ROW_HEIGHT_ESTIMATE);
      }
      return DATA_TABLE_CONSTANTS.ROW_HEIGHT_ESTIMATE;
    }, []),
    overscan,
    // Fixed: Optimize measureElement to avoid duplicate getBoundingClientRect calls
    measureElement: (el) => {
      if (!el) return DATA_TABLE_CONSTANTS.ROW_HEIGHT_ESTIMATE;

      const height = el.getBoundingClientRect().height;

      // Memory management for measured heights
      measuredHeightsRef.current = [
        ...measuredHeightsRef.current.slice(-DATA_TABLE_CONSTANTS.MEASURED_HEIGHTS_TRIM + 1),
        height,
      ];

      // Trim if exceeds max
      if (measuredHeightsRef.current.length > DATA_TABLE_CONSTANTS.MAX_MEASURED_HEIGHTS) {
        measuredHeightsRef.current = measuredHeightsRef.current.slice(
          -DATA_TABLE_CONSTANTS.MEASURED_HEIGHTS_TRIM,
        );
      }

      return height;
    },
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  // Virtual rows with stable keys for better performance
  const virtualRowsWithStableKeys = useMemo(
    () =>
      virtualRows.map((vRow) => ({
        ...vRow,
        stableKey: `${vRow.index}-${rows[vRow.index]?.id || vRow.index}`,
      })),
    [virtualRows, rows],
  );

  // Fixed: Infinite scrolling with simplified trigger logic and removed accidental local mountedRef
  const handleScrollInternal = useCallback(async () => {
    if (!mountedRef.current || !tableContainerRef.current) return;

    const scrollElement = tableContainerRef.current;
    const clientHeight = scrollElement.clientHeight;
    const virtualEnd = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].end : 0;

    // Simplified condition: check distance to virtual end
    const nearEnd =
      totalSize - virtualEnd <= clientHeight * DATA_TABLE_CONSTANTS.INFINITE_SCROLL_THRESHOLD;

    if (nearEnd) {
      try {
        await fetchNextPage?.();
      } catch (err) {
        const rawError = err instanceof Error ? err : new Error('Failed to fetch next page');
        const sanitizedMessage = sanitizeError(rawError);
        const sanitizedError = new Error(sanitizedMessage);
        setError(sanitizedError);
        onError?.(sanitizedError);
      }
    }
  }, [fetchNextPage, totalSize, virtualRows, onError, sanitizeError]);

  const throttledHandleScroll = useMemo(
    () => throttle(handleScrollInternal, DATA_TABLE_CONSTANTS.SCROLL_THROTTLE_MS),
    [handleScrollInternal],
  );

  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement || !hasNextPage || isFetchingNextPage) return;

    scrollElement.addEventListener('scroll', throttledHandleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', throttledHandleScroll);
  }, [throttledHandleScroll, hasNextPage, isFetchingNextPage]);

  // Resize observer for virtualizer revalidation
  const handleWindowResize = useCallback(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    const resizeObserver = new ResizeObserver(() => {
      rowVirtualizer.measure();
      if (scrollElement) {
        throttledHandleScroll();
      }
    });

    resizeObserver.observe(scrollElement);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [rowVirtualizer, handleWindowResize, throttledHandleScroll]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Dynamic measurement optimization
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    if (mountedRef.current && tableContainerRef.current && virtualRows.length > 0) {
      requestAnimationFrame(() => {
        if (mountedRef.current) {
          rowVirtualizer.measure();
          virtualRowsWithStableKeys.forEach((virtualRow) => {
            const rowElement = tableContainerRef.current?.querySelector(
              `[data-index="${virtualRow.index}"]`,
            );
            if (rowElement) {
              const height = rowElement.getBoundingClientRect().height;
              measuredHeightsRef.current = [...measuredHeightsRef.current.slice(-9), height];
            }
          });
        }
      });
    }
  }, [
    data.length,
    rowVirtualizer,
    isSmallScreen,
    virtualRowsWithStableKeys.length,
    virtualRowsWithStableKeys,
    virtualRows.length,
  ]);

  // Search effect with optimized state updates
  useEffect(() => {
    if (debouncedTerm !== filterValue) {
      setIsSearching(true);
      startTransition(() => {
        onFilterChange?.(debouncedTerm);
      });
    }
  }, [debouncedTerm, onFilterChange, filterValue]);

  useEffect(() => {
    if (!isFetching && isSearching) {
      setIsSearching(false);
    }
  }, [isFetching, isSearching]);

  // Internal filtering when no external filter handler
  useEffect(() => {
    if (filterColumn && !onFilterChange) {
      const newFilters = debouncedTerm ? [{ id: filterColumn, value: debouncedTerm }] : [];
      setColumnFilters(newFilters);
    }
  }, [debouncedTerm, filterColumn, onFilterChange]);

  // Optimized delete handler with batch operations
  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      const selectedRowsLength = table.getFilteredSelectedRowModel().rows.length;
      let selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);

      // Validation
      if (selectedRows.length === 0) {
        setIsDeleting(false);
        return;
      }

      // Filter out non-object entries
      selectedRows = selectedRows.filter(
        (row): row is TData => typeof row === 'object' && row !== null,
      );

      if (selectedRows.length !== selectedRowsLength && process.env.NODE_ENV === 'development') {
        console.warn('DataTable: Invalid row data detected and filtered out during deletion.');
      }

      await onDelete(selectedRows);

      // Batch state updates
      startTransition(() => {
        table.resetRowSelection();
        setOptimizedRowSelection({});
      });
    } catch (err) {
      const rawError = err instanceof Error ? err : new Error('Failed to delete items');
      const sanitizedMessage = sanitizeError(rawError);
      const sanitizedError = new Error(sanitizedMessage);
      setError(sanitizedError);
      onError?.(sanitizedError);
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete, table, isDeleting, onError, sanitizeError, setOptimizedRowSelection]);

  // Reset handler for error boundary retry
  const handleBoundaryReset = useCallback(() => {
    setError(null);
    onReset?.();
    // Re-measure virtualizer after reset
    if (tableContainerRef.current && rowVirtualizer) {
      rowVirtualizer.measure();
    }
  }, [onReset, rowVirtualizer]);

  // Fixed: Derive selected count from stable table state instead of re-calling getFilteredSelectedRowModel
  const selectedCount = useMemo(() => {
    const selection = table.getState().rowSelection;
    return Object.keys(selection).length;
  }, [table.getState().rowSelection]);

  const shouldShowSearch = useMemo(
    () => enableSearch && filterColumn && table.getColumn(filterColumn),
    [
      enableSearch,
      filterColumn,
      table
        .getAllColumns()
        .map((c) => c.id)
        .join(','),
    ],
  );

  return (
    <div
      className={cn('flex h-full flex-col gap-4', className)}
      role="region"
      aria-label="Data table"
    >
      {/* Accessible live region for loading announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isFetchingNextPage
          ? 'Loading more rows'
          : hasNextPage
            ? 'More rows available'
            : 'All rows loaded'}
      </div>

      {/* Error display - kept outside boundary for non-rendering errors */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {sanitizeError(error)}
          <button onClick={() => setError(null)} className="ml-2 underline hover:no-underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Controls - kept outside boundary as they're stable */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        {enableRowSelection && showCheckboxes && (
          <DeleteButton
            onDelete={onDelete ? handleDelete : undefined}
            isDeleting={isDeleting}
            disabled={!selectedCount || isDeleting}
            isSmallScreen={isSmallScreen}
            ariaLabel={localize('com_ui_delete_selected_items')}
          />
        )}

        {shouldShowSearch && (
          <div className={`relative ${DATA_TABLE_CONSTANTS.SEARCH_INPUT_MIN_WIDTH} flex-1`}>
            <AnimatedSearchInput
              value={term}
              onChange={(e) => {
                startTransition(() => setTerm(e.target.value));
              }}
              isSearching={isWaitingForSearchResults}
              placeholder="Search..."
              aria-label="Search table data"
            />
          </div>
        )}

        {selectedCount > 0 && (
          <div className="text-sm text-text-secondary">
            {selectedCount} row{selectedCount === 1 ? '' : 's'} selected
          </div>
        )}
      </div>

      {/* Error boundary wraps only the table container to catch rendering errors */}
      <DataTableErrorBoundary onError={onError} onReset={handleBoundaryReset}>
        <div
          ref={tableContainerRef}
          className={cn(
            `relative h-[calc(100vh-20rem)] max-w-full overflow-auto rounded-md border border-black/10 dark:border-white/10`,
            `transition-all ${DATA_TABLE_CONSTANTS.ROW_TRANSITION_DURATION} ease-out`,
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600',
            isRefreshing && 'bg-surface-secondary/30',
          )}
          role="grid"
          aria-label="Data grid"
          aria-rowcount={data.length}
          aria-busy={isLoading || isFetchingNextPage}
        >
          <Table
            className={`w-full min-w-[${DATA_TABLE_CONSTANTS.TABLE_MIN_WIDTH}] table-fixed border-separate border-spacing-0`}
            style={{ borderCollapse: 'separate' }}
          >
            <TableHeader className="sticky top-0 z-50 bg-surface-secondary backdrop-blur-sm">
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border-light" role="row">
                  {headerGroup.headers.map((header) => {
                    const sortDir = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();

                    let ariaSort: 'ascending' | 'descending' | 'none' | undefined;
                    if (!canSort) {
                      ariaSort = undefined;
                    } else if (sortDir === 'asc') {
                      ariaSort = 'ascending';
                    } else if (sortDir === 'desc') {
                      ariaSort = 'descending';
                    } else {
                      ariaSort = 'none';
                    }

                    return (
                      <TableHead
                        key={header.id}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        // Fixed: Add keyboard activation for sorting
                        onKeyDown={
                          canSort
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  header.column.toggleSorting();
                                }
                              }
                            : undefined
                        }
                        className={cn(
                          'relative whitespace-nowrap bg-surface-secondary px-2 py-2 text-left text-sm font-medium text-text-secondary transition-colors duration-200 sm:px-4',
                          canSort &&
                            'cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        )}
                        style={{
                          ...columnStyles[header.column.id],
                          ...getCommonPinningStyles(header.column, table),
                        }}
                        role="columnheader"
                        tabIndex={canSort ? 0 : -1}
                        aria-sort={ariaSort}
                      >
                        <div className="flex items-center">
                          <span className="flex-1 text-left">
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {canSort && (
                            <span className="ml-1 transition-transform duration-200 ease-in-out">
                              {!sortDir && (
                                <ArrowDownUp className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                              )}
                              {sortDir === 'asc' && <ArrowUp className="h-4 w-4 text-primary" />}
                              {sortDir === 'desc' && (
                                <ArrowUp className="h-4 w-4 rotate-180 text-primary" />
                              )}
                            </span>
                          )}
                        </div>
                        {/* Column pinning controls */}
                        {enableColumnPinning &&
                          !header.isPlaceholder &&
                          header.column.getCanPin() && (
                            <div className="mt-1 flex justify-center gap-1">
                              {header.column.getIsPinned() !== 'left' && (
                                <button
                                  className="rounded border px-1 text-xs hover:bg-surface-hover"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    header.column.pin('left');
                                  }}
                                  title="Pin to left"
                                >
                                  ←
                                </button>
                              )}
                              {header.column.getIsPinned() && (
                                <button
                                  className="rounded border px-1 text-xs hover:bg-surface-hover"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    header.column.pin(false);
                                  }}
                                  title="Unpin"
                                >
                                  ×
                                </button>
                              )}
                              {header.column.getIsPinned() !== 'right' && (
                                <button
                                  className="rounded border px-1 text-xs hover:bg-surface-hover"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    header.column.pin('right');
                                  }}
                                  title="Pin to right"
                                >
                                  →
                                </button>
                              )}
                            </div>
                          )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody role="rowgroup">
              {paddingTop > 0 && (
                <tr>
                  <td style={{ height: `${paddingTop}px` }} />
                </tr>
              )}

              {showSkeletons ? (
                <SkeletonRows
                  count={skeletonCount}
                  columns={tableColumns as TableColumn<unknown, unknown>[]}
                  columnStyles={columnStyles}
                />
              ) : (
                virtualRowsWithStableKeys.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <MemoizedTableRow
                      key={virtualRow.stableKey}
                      row={row}
                      columnStyles={columnStyles}
                      table={table}
                      index={virtualRow.index}
                      virtualIndex={virtualRow.index}
                    />
                  );
                })
              )}

              {data.length === 0 && !isLoading && (
                <TableRow className="hover:bg-transparent" role="row">
                  <TableCell
                    colSpan={tableColumns.length}
                    className="p-8 text-center text-text-secondary"
                    role="gridcell"
                  >
                    {debouncedTerm
                      ? localize('com_ui_no_results_found')
                      : localize('com_ui_no_data_available')}
                  </TableCell>
                </TableRow>
              )}

              {paddingBottom > 0 && (
                <tr>
                  <td style={{ height: `${paddingBottom}px` }} />
                </tr>
              )}

              {/* Loading indicator for infinite scroll */}
              {(isFetchingNextPage || hasNextPage) && !isLoading && (
                <TableRow className="hover:bg-transparent" role="row">
                  <TableCell colSpan={tableColumns.length} className="p-4" role="gridcell">
                    <div className="flex h-full items-center justify-center">
                      {isFetchingNextPage ? (
                        <Spinner className="size-4" aria-label="Loading more data" />
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
      </DataTableErrorBoundary>
    </div>
  );
}
