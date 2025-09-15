import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  useMemo,
  startTransition,
} from 'react';
import { ArrowUp, ArrowDownUp } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Row,
  ColumnDef,
  flexRender,
  SortingState,
  useReactTable,
  getCoreRowModel,
  VisibilityState,
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

// interface PrevProps {
//   defaultSort: SortingState;
//   dataLength: number;
//   columnsLength: number;
//   filterValue: string;
//   sortingLength?: number;
// }

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
  INFINITE_SCROLL_THRESHOLD: 2.5 as const, // multiplier of clientHeight - increased for earlier trigger
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

/**
 * Dynamic skeleton width calculator based on priorities
 * Returns pixel value for skeleton sizing that matches final content proportions
 */
const getSkeletonWidth = (
  priority: number,
  containerWidth: number,
  totalPriority: number,
): string => {
  const ratio = priority / totalPriority;
  const baseWidth = Math.max(50, containerWidth * ratio * 0.8); // 80% of allocated space for visual balance
  return `${Math.min(baseWidth, containerWidth * 0.3)}px`; // Cap at 30% of container to prevent overflow
};

type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  accessorKey?: string | number;
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
    priority?: number; // 1-5 scale, higher = more width priority
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
    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // Handle non-array objects
    if (!Array.isArray(a) && !Array.isArray(b)) {
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
      className={`flex h-full items-center justify-center`}
      style={{ width: DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH }}
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

/**
 * Dynamic column width calculator using priority-based distribution
 * Computes relative widths based on semantic priorities and container size
 */
const useDynamicColumnWidths = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  containerRef: React.RefObject<HTMLDivElement>,
  isSmallScreen: boolean,
) => {
  // Stabilize columns array to prevent infinite re-renders
  const stableColumns = useMemo(() => {
    return columns.map((c) => ({
      id: c.id,
      accessorKey: c.accessorKey,
      meta: c.meta,
    }));
  }, [columns]);

  return useMemo(() => {
    // Get container width directly without state to prevent re-render loops
    const containerWidth = containerRef.current?.clientWidth || 0;

    if (containerWidth === 0) {
      return {};
    }

    // Calculate total priority
    const totalPriority = stableColumns.reduce((sum, column) => {
      const explicitPriority = column.meta?.priority;
      const priority = explicitPriority ?? 1; // uniform default
      return sum + priority;
    }, 0);

    if (totalPriority === 0) {
      return {};
    }

    const keyFor = (column: (typeof stableColumns)[0]): string =>
      String(column.id ?? column.accessorKey ?? '');

    const widths: number[] = [];
    const columnDetails: Array<{
      key: string;
      id: string;
      finalWidth: number;
      source: string;
      metaSize: string | number | undefined;
    }> = [];
    const result = stableColumns.reduce(
      (acc, column) => {
        const key = keyFor(column);
        if (!key) {
          return acc;
        }

        const explicitPriority = column.meta?.priority;
        const priority = explicitPriority ?? 1; // uniform default

        // Check for fixed size first
        let finalWidth: number;
        let source = 'calculated';
        const metaSize = column.meta?.size;

        if (metaSize && typeof metaSize === 'string' && metaSize.includes('px')) {
          finalWidth = (parseFloat(metaSize) / containerWidth) * 100; // Convert px to %
          source = 'fixed px';
        } else if (isSmallScreen && column.meta?.mobileSize) {
          const mobileSize = column.meta.mobileSize;
          if (typeof mobileSize === 'string' && mobileSize.includes('px')) {
            finalWidth = (parseFloat(mobileSize) / containerWidth) * 100;
            source = 'mobile px';
          } else {
            finalWidth = parseFloat(mobileSize as string) || (priority / totalPriority) * 100;
            source = 'mobile %';
          }
        } else {
          // Compute relative width as percentage
          const ratio = priority / totalPriority;
          finalWidth = Math.max(5, Math.min(60, ratio * 100)); // 5-60% range
          source = 'calculated %';
        }

        // Determine minWidth - prefer explicit, fallback to standard
        let minWidth: string | number | undefined;
        if (column.meta?.minWidth) {
          minWidth = column.meta.minWidth;
        } else {
          minWidth = 'min-content';
        }

        widths.push(finalWidth);
        columnDetails.push({ key, id: column.id || '', finalWidth, source, metaSize });

        acc[key] = {
          width: `${finalWidth}%`,
          minWidth,
          maxWidth: column.meta?.size || 'none',
          flex: `0 0 ${finalWidth}%`, // For flex fallback
          // Ensure content doesn't break layout
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        } as React.CSSProperties;

        return acc;
      },
      {} as Record<string, React.CSSProperties>,
    );

    // Diagnostic log: Check total width allocation
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);

    // Only log in development and when there are issues
    if (process.env.NODE_ENV === 'development' && totalWidth > 100) {
      console.warn(
        '[DataTable Debug] WARNING: Column widths exceed 100% - potential horizontal overflow!',
        { containerWidth, columnDetails, totalWidth },
      );
    }

    return result;
  }, [stableColumns, isSmallScreen, containerRef]);
};

// Legacy support hook - wraps dynamic widths with backward compatibility
const useColumnStyles = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  isSmallScreen: boolean,
  containerRef: React.RefObject<HTMLDivElement>,
): ReturnType<typeof useDynamicColumnWidths> => {
  return useDynamicColumnWidths(columns, containerRef, isSmallScreen);
};

const TableRowComponent = <TData,>({
  row,
  columnStyles,
  index,
  virtualIndex,
}: {
  row: Row<TData>;
  columnStyles: Record<string, React.CSSProperties>;
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
      className="motion-safe:animate-fadeIn border-b border-border-light opacity-100 transition-opacity duration-200 ease-out hover:bg-surface-secondary"
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
        style={{ minWidth: DATA_TABLE_CONSTANTS.DELETE_BUTTON_MIN_WIDTH }}
        className={cn(
          `transition-all hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20`,
          isSmallScreen && 'px-2 py-1',
        )}
        aria-label={isDeleting ? 'Deleting selected rows' : 'Delete selected rows'}
      >
        {isDeleting ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <>
            <TrashIcon className="h-4 w-4 text-red-500 sm:h-4 sm:w-4" />
          </>
        )}
      </Button>
    );
  },
);

DeleteButton.displayName = 'DeleteButton';

/**
 * Dynamic skeleton rows that match final column proportions to prevent CLS
 * Uses same priority-based width calculation as real content
 */
const SkeletonRows = memo(function <TData, TValue>({
  count = 10,
  columns,
  columnStyles,
  containerRef,
}: {
  count?: number;
  columns: TableColumn<TData, TValue>[];
  columnStyles: Record<string, React.CSSProperties>;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  if (!columns.length || !containerRef.current) {
    return null;
  }

  const containerWidth = containerRef.current.clientWidth;

  // Calculate total priority for skeleton width distribution
  const totalPriority = columns.reduce((sum, column) => {
    const explicitPriority = column.meta?.priority;
    const priority = explicitPriority ?? 1; // uniform default
    return sum + priority;
  }, 0);

  if (totalPriority === 0) {
    return null;
  }

  // Helper function to get column key - same as in useDynamicColumnWidths
  const keyFor = (column: TableColumn<TData, TValue>): string =>
    String(column.id ?? column.accessorKey ?? '');

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableRow
          key={`skeleton-${index}`}
          className="h-12 border-b border-border-light"
          style={{ height: '48px' }}
        >
          {columns.map((column, colIndex) => {
            const columnKey = keyFor(column);
            const baseStyle = columnStyles[columnKey] || {};
            const explicitPriority = column.meta?.priority;
            const priority = explicitPriority ?? 1; // uniform default
            // Use priority-based width for all skeleton cells
            const skeletonWidth = getSkeletonWidth(priority, containerWidth, totalPriority);
            const skeletonStyle: React.CSSProperties = {
              ...baseStyle,
              width: skeletonWidth,
              minWidth: skeletonWidth,
              height: '48px',
            };

            return (
              <TableCell
                key={columnKey || `col-${colIndex}`}
                className="h-full px-2 py-1 sm:px-4 sm:py-2"
                style={skeletonStyle}
              >
                <Skeleton
                  className="h-full w-full animate-pulse"
                  style={{ width: '100%', height: '100%' }}
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
  // const prevPropsRef = useRef<PrevProps | null>(null); // Disabled with debug logging

  const tableConfig = useMemo(() => {
    return {
      enableRowSelection: config?.selection?.enableRowSelection ?? true,
      showCheckboxes: config?.selection?.showCheckboxes ?? true,
      enableSearch: config?.search?.enableSearch ?? true,
      filterColumn: config?.search?.filterColumn,
      skeletonCount: config?.skeleton?.count ?? 10,
      overscan: config?.virtualization?.overscan ?? DATA_TABLE_CONSTANTS.OVERS_CAN,
      debounceDelay: config?.search?.debounce ?? DATA_TABLE_CONSTANTS.SEARCH_DEBOUNCE_MS,
    };
  }, [config]);

  const {
    enableRowSelection,
    showCheckboxes,
    enableSearch,
    // filterColumn, // Disabled with debug logging
    skeletonCount,
    overscan,
    debounceDelay,
  } = tableConfig;

  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
  const [rawTerm, setRawTerm] = useState(filterValue ?? '');
  const [isImmediateSearch, setIsImmediateSearch] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedTerm = useDebounced(rawTerm, debounceDelay);

  const isTransitioning = isFetching || isImmediateSearch;

  // Track when we're waiting for search results
  const isWaitingForSearchResults = isSearching && isFetching;
  const isFirstLoad = isLoading && data.length === 0;
  const isRefreshing = isFetching && !isFirstLoad && !isFetchingNextPage && !isSearching;

  // Show skeletons during initial load, refresh, search, or transitioning
  // Exclude isFetchingNextPage to prevent skeletons during infinite scroll
  const showSkeletons =
    isFirstLoad ||
    isRefreshing ||
    isWaitingForSearchResults ||
    (isTransitioning && !isFetchingNextPage) || // Don't show skeletons during infinite scroll
    rawTerm !== debouncedTerm; // Show during typing

  // External sorting support: use provided sorting state, fall back to internal
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort);
  const finalSorting = sorting ?? internalSorting;

  // Mount tracking for cleanup - Fixed: Declare mountedRef before any callback that uses it
  const mountedRef = useRef(true);

  // Sync internal sorting with defaultSort changes
  useEffect(() => {
    if (!sorting) setInternalSorting(defaultSort);
  }, [defaultSort, sorting]);

  // Keep search input in sync with external filterValue
  useEffect(() => {
    setRawTerm(filterValue ?? '');
  }, [filterValue]);

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

  renderCountRef.current += 1;

  const sanitizeError = useCallback((err: Error): string => {
    const message = err.message;
    if (message?.includes('auth') || message?.includes('token')) {
      return 'Authentication failed. Please log in again.';
    }
    return process.env.NODE_ENV === 'development'
      ? message
      : 'An error occurred. Please try again.';
  }, []);

  const tableColumns = useMemo(() => {
    if (!enableRowSelection || !showCheckboxes) return columns;

    const selectColumn: TableColumn<TData, boolean> = {
      id: 'select',
      header: ({ table }: { table: TTable<TData> }) => (
        <div
          className={`flex h-full items-center justify-center`}
          style={{ width: DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH }}
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

  // Dynamic column styles with priority-based sizing
  const columnStyles = useColumnStyles(
    tableColumns as TableColumn<TData, TValue>[],
    isSmallScreen,
    tableContainerRef,
  );

  // Set CSS variables for column sizing with hash optimization - prevent re-render loops
  const columnSizesHashRef = useRef<string>('');
  const prevTableColumnsRef = useRef<typeof tableColumns>([]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !tableContainerRef.current) return;

    // Only update if columns or styles actually changed
    const columnsChanged = prevTableColumnsRef.current.length !== tableColumns.length;

    // Calculate hash of column sizes to avoid unnecessary DOM writes
    const sizesHash = tableColumns
      .map((col, index) => `${index}:${columnStyles[col.id!]?.width || 'auto'}`)
      .join('|');

    if (columnsChanged || sizesHash !== columnSizesHashRef.current) {
      columnSizesHashRef.current = sizesHash;
      prevTableColumnsRef.current = tableColumns;

      // Batch DOM updates to prevent layout thrashing
      requestAnimationFrame(() => {
        if (tableContainerRef.current) {
          tableColumns.forEach((column, index) => {
            if (column.id) {
              const size = columnStyles[column.id]?.width || 'auto';
              tableContainerRef.current!.style.setProperty(`--col-${index}-size`, `${size}`);
            }
          });
        }
      });
    }
  }, [tableColumns, columnStyles]);

  // Memoized row data with stable references - deep comparison to prevent unnecessary re-renders
  const memoizedRowData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      _index: index,
      _id: (item as Record<string, unknown>)?.id || index,
    }));
  }, [data]);

  // React Table instance
  const tableData = memoizedRowData;

  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection,
    enableMultiRowSelection: true,
    manualSorting: true, // Use manual sorting for server-side sorting
    manualFiltering: true,
    state: {
      sorting: finalSorting,
      columnVisibility,
      rowSelection: optimizedRowSelection,
    },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setOptimizedRowSelection,
  });

  const { rows } = table.getRowModel();

  // Fixed: Simplify header groups - React Table already memoizes internally
  const headerGroups = table.getHeaderGroups();

  // Virtual scrolling setup with optimized height measurement
  const measuredHeightsRef = useRef<number[]>([]);
  const measureElementCallback = useCallback((el: Element | null) => {
    if (!el) return DATA_TABLE_CONSTANTS.ROW_HEIGHT_ESTIMATE;

    const height = el.getBoundingClientRect().height;

    // Memory management for measured heights - only update if significantly different
    const lastHeight = measuredHeightsRef.current[measuredHeightsRef.current.length - 1];
    if (!lastHeight || Math.abs(height - lastHeight) > 1) {
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
    }

    return height;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => {
      // SSR safety: return null during SSR
      if (typeof window === 'undefined') return null;
      return tableContainerRef.current;
    }, []),
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
    measureElement: measureElementCallback,
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

  // Store scroll position before fetching to prevent jumping
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  const isRestoringScrollRef = useRef(false);

  // Fixed: Infinite scrolling with scroll position preservation
  const handleScrollInternal = useCallback(async () => {
    if (!mountedRef.current || !tableContainerRef.current) return;

    // Early return if conditions not met
    if (!hasNextPage || isFetchingNextPage || isRestoringScrollRef.current) return;

    const scrollElement = tableContainerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;

    // More precise threshold calculation
    const scrollThreshold =
      scrollHeight - clientHeight * DATA_TABLE_CONSTANTS.INFINITE_SCROLL_THRESHOLD;
    const nearEnd = scrollTop >= scrollThreshold;

    if (nearEnd) {
      try {
        // Store current scroll position before fetching
        scrollPositionRef.current = {
          top: scrollTop,
          timestamp: Date.now(),
        };

        await fetchNextPage?.();
      } catch (err) {
        // Clear stored position on error
        scrollPositionRef.current = null;
        const rawError = err instanceof Error ? err : new Error('Failed to fetch next page');
        const sanitizedMessage = sanitizeError(rawError);
        const sanitizedError = new Error(sanitizedMessage);
        setError(sanitizedError);
        onError?.(sanitizedError);
      }
    }
  }, [fetchNextPage, onError, sanitizeError, hasNextPage, isFetchingNextPage]);

  const throttledHandleScroll = useMemo(
    () => throttle(handleScrollInternal, DATA_TABLE_CONSTANTS.SCROLL_THROTTLE_MS),
    [handleScrollInternal],
  );

  // Scroll position restoration effect - prevents jumping when new data is added
  useEffect(() => {
    if (!isFetchingNextPage && scrollPositionRef.current && tableContainerRef.current) {
      const { top, timestamp } = scrollPositionRef.current;
      const isRecent = Date.now() - timestamp < 1000; // Only restore if within 1 second

      if (isRecent) {
        isRestoringScrollRef.current = true;

        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (tableContainerRef.current && mountedRef.current) {
            const scrollElement = tableContainerRef.current;
            const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
            const targetScroll = Math.min(top, maxScroll);

            scrollElement.scrollTo({
              top: targetScroll,
              behavior: 'auto', // Instant restoration
            });

            // Clear restoration flag after a brief delay
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 100);
          }
        });
      }

      // Clear stored position
      scrollPositionRef.current = null;
    }
  }, [isFetchingNextPage, data.length]); // Trigger when fetch completes or data changes

  // Always attach scroll listener with optimized event handling to reduce GC pressure
  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    // Pre-bind the handler to avoid creating new functions on each scroll
    const scrollHandler = throttledHandleScroll;

    // Use passive listener for better performance
    const options = { passive: true };
    scrollElement.addEventListener('scroll', scrollHandler, options);

    return () => {
      scrollElement.removeEventListener('scroll', scrollHandler);
    };
  }, [throttledHandleScroll]);

  // Resize observer for virtualizer revalidation - heavily throttled to prevent rapid re-renders
  const handleWindowResize = useCallback(() => {
    // Debounce resize to prevent rapid re-renders
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        rowVirtualizer.measure();
      }
    }, 250); // Increased delay significantly
  }, [rowVirtualizer]);

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Optimized resize observer with reduced layout thrashing
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    // Increased throttling to reduce excessive re-renders and GC pressure
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastResizeTime = 0;
    const MIN_RESIZE_INTERVAL = 500; // Increased from 250ms to reduce GC pressure

    const resizeObserver = new ResizeObserver(() => {
      const now = Date.now();
      if (now - lastResizeTime < MIN_RESIZE_INTERVAL) return;

      lastResizeTime = now;
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          // Only measure if not currently restoring scroll position
          rowVirtualizer.measure();
        }
      }, MIN_RESIZE_INTERVAL);
    });

    resizeObserver.observe(scrollElement);

    // Optimized window resize handler with increased debouncing
    const windowResizeHandler = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          rowVirtualizer.measure();
        }
      }, MIN_RESIZE_INTERVAL);
    };

    window.addEventListener('resize', windowResizeHandler, { passive: true });

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('resize', windowResizeHandler);
    };
  }, [rowVirtualizer, handleWindowResize]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Optimized dynamic measurement - prevent infinite loops with better guards and reduced frequency
  const lastMeasurementRef = useRef<{
    dataLength: number;
    isSmallScreen: boolean;
    virtualRowsLength: number;
    isTransitioning: boolean;
    timestamp: number;
  }>({
    dataLength: 0,
    isSmallScreen: false,
    virtualRowsLength: 0,
    isTransitioning: false,
    timestamp: 0,
  });

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || isTransitioning || isRestoringScrollRef.current) return;

    const current = {
      dataLength: data.length,
      isSmallScreen,
      virtualRowsLength: virtualRowsWithStableKeys.length,
      isTransitioning,
      timestamp: Date.now(),
    };

    const timeSinceLastMeasurement = current.timestamp - lastMeasurementRef.current.timestamp;

    // Only measure if something meaningful changed AND enough time has passed
    const hasChanged =
      current.dataLength !== lastMeasurementRef.current.dataLength ||
      current.isSmallScreen !== lastMeasurementRef.current.isSmallScreen ||
      current.virtualRowsLength !== lastMeasurementRef.current.virtualRowsLength;

    // Increased throttle to 200ms to reduce GC pressure and improve performance
    if (!hasChanged || timeSinceLastMeasurement < 200) return;

    lastMeasurementRef.current = current;

    if (mountedRef.current && tableContainerRef.current && virtualRows.length > 0) {
      // Increased debounce delay to reduce re-renders
      const measurementTimeout = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          rowVirtualizer.measure();
        }
      }, 100);

      return () => clearTimeout(measurementTimeout);
    }
  }, [
    data.length,
    rowVirtualizer,
    isSmallScreen,
    virtualRowsWithStableKeys.length,
    virtualRows.length,
    isTransitioning,
  ]);

  // Search effect with optimized state updates
  useEffect(() => {
    if (rawTerm !== filterValue) {
      setIsImmediateSearch(true);
    }
  }, [rawTerm, filterValue]);

  useEffect(() => {
    if (debouncedTerm !== filterValue) {
      setIsSearching(true);
      startTransition(() => {
        onFilterChange?.(debouncedTerm);
      });
    }
  }, [debouncedTerm, onFilterChange, filterValue]);

  useEffect(() => {
    if (!isFetching && isImmediateSearch) {
      setIsImmediateSearch(false);
    }
  }, [isFetching, isImmediateSearch]);

  useEffect(() => {
    if (!isFetching && isSearching) {
      setIsSearching(false);
    }
  }, [isFetching, isSearching]);

  // Optimized delete handler with batch operations
  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      // Use getSelectedRowModel instead of getFilteredSelectedRowModel
      const selectedRowsLength = table.getSelectedRowModel().rows.length;
      let selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

      // Validation
      if (selectedRows.length === 0) {
        setIsDeleting(false);
        return;
      }

      // Filter out non-object entries
      selectedRows = selectedRows.filter(
        (row): row is TData => typeof row === 'object' && row !== null,
      );

      // TODO: Remove this - only for development
      if (selectedRows.length !== selectedRowsLength && true) {
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

  const selectedCount = useMemo(() => {
    const selection = optimizedRowSelection;
    return Object.keys(selection).length;
  }, [optimizedRowSelection]);

  const shouldShowSearch = useMemo(
    () => enableSearch && !!onFilterChange,
    [enableSearch, onFilterChange],
  );

  return (
    <div
      className={cn('flex h-full flex-col gap-4', className)}
      role="region"
      aria-label="Data table"
    >
      {/* Accessible live region for loading announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {(() => {
          if (isSearching) return 'Searching...';
          if (isFetchingNextPage) return 'Loading more rows';
          if (hasNextPage) return 'More rows available';
          return 'All rows loaded';
        })()}
      </div>

      {/* Error display - kept outside boundary for non-rendering errors */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {sanitizeError(error)}
          <Button
            variant="ghost"
            onClick={() => setError(null)}
            className="ml-2 h-auto p-0 text-red-700 underline hover:no-underline dark:text-red-400"
          >
            ×
          </Button>
        </div>
      )}

      {/* Isolated Toolbar - Outside scroll container */}
      <div className="sticky top-0 z-50 w-full bg-background">
        <div
          className="flex flex-wrap items-center gap-2 shadow-sm backdrop-blur-sm sm:gap-4"
          style={{ height: '4rem' }}
        >
          {enableRowSelection && showCheckboxes && (
            <DeleteButton
              onDelete={onDelete ? handleDelete : undefined}
              isDeleting={isDeleting}
              disabled={!selectedCount || isDeleting}
              isSmallScreen={isSmallScreen}
            />
          )}

          {shouldShowSearch && (
            <div
              className="relative flex-1"
              style={{
                minWidth: DATA_TABLE_CONSTANTS.SEARCH_INPUT_MIN_WIDTH,
                contain: 'layout paint',
                overflow: 'hidden',
              }}
            >
              <AnimatedSearchInput
                value={rawTerm}
                onChange={(e) => {
                  startTransition(() => setRawTerm(e.target.value));
                }}
                isSearching={isWaitingForSearchResults}
                placeholder="Search..."
                aria-label="Search table data"
              />
            </div>
          )}

          {selectedCount > 0 && (
            <div className="text-sm text-text-secondary">{`${selectedCount} selected`}</div>
          )}
        </div>
      </div>

      {/* Error boundary wraps the scrollable table container */}
      <DataTableErrorBoundary onError={onError} onReset={handleBoundaryReset}>
        <div
          ref={tableContainerRef}
          className={cn(
            `relative h-[calc(100vh-24rem)] max-w-full overflow-auto rounded-lg border border-black/10 dark:border-white/10`,
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 transition-all ease-out',
            isRefreshing && 'bg-surface-secondary/30',
          )}
          style={{
            contain: 'layout size strict',
            minWidth: DATA_TABLE_CONSTANTS.TABLE_MIN_WIDTH,
            maxWidth: '100%',
            boxSizing: 'border-box',
            transitionDuration: DATA_TABLE_CONSTANTS.ROW_TRANSITION_DURATION,
          }}
          onWheel={(e) => {
            if (isFetchingNextPage) {
              e.preventDefault();
              return;
            }
            if (isTransitioning) {
              e.deltaY *= 0.5;
            }
          }}
          role="grid"
          aria-label="Data grid"
          aria-rowcount={data.length}
          aria-busy={isLoading || isFetching || isFetchingNextPage}
        >
          <div className="w-full" style={{ width: '100%' }}>
            <Table
              className="w-full table-fixed border-separate border-spacing-0"
              style={{
                borderCollapse: 'separate',
                minWidth: DATA_TABLE_CONSTANTS.TABLE_MIN_WIDTH,
                maxWidth: '100%',
                tableLayout: 'fixed',
                width: '100%',
              }}
            >
              {/* Sticky Table Header - Fixed z-index and positioning */}
              <TableHeader
                className="sticky border-b border-border-light bg-surface-secondary backdrop-blur-sm"
                style={{
                  height: '40px',
                  zIndex: 10, // Lower, toolbar is now outside
                  top: 0,
                }}
              >
                {headerGroups.map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-b border-border-light"
                    role="row"
                  >
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
                            'group relative box-border whitespace-nowrap bg-surface-secondary px-2 py-3 text-left text-sm font-medium text-text-secondary transition-colors duration-200 sm:px-4',
                            canSort &&
                              'cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          )}
                          style={{
                            ...columnStyles[header.column.id],
                            backgroundColor: 'var(--surface-secondary)',
                            position: 'sticky',
                            top: 0,
                            boxSizing: 'border-box',
                            maxWidth: 'none',
                          }}
                          role="columnheader"
                          scope="col"
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
                    containerRef={tableContainerRef}
                  />
                ) : (
                  virtualRowsWithStableKeys.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <MemoizedTableRow
                        key={virtualRow.stableKey}
                        row={row}
                        columnStyles={columnStyles}
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
                      {debouncedTerm ? localize('com_ui_no_results_found') : 'No data available'}
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
                          <Spinner className="h-4 w-4" aria-label="Loading more data" />
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
      </DataTableErrorBoundary>
    </div>
  );
}

// interface PrevProps {
//   defaultSort: SortingState;
//   dataLength: number;
//   columnsLength: number;
//   filterValue: string;
//   sortingLength?: number;
// }

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
  INFINITE_SCROLL_THRESHOLD: 2.5 as const, // multiplier of clientHeight - increased for earlier trigger
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

/**
 * Dynamic skeleton width calculator based on priorities
 * Returns pixel value for skeleton sizing that matches final content proportions
 */
const getSkeletonWidth = (
  priority: number,
  containerWidth: number,
  totalPriority: number,
): string => {
  const ratio = priority / totalPriority;
  const baseWidth = Math.max(50, containerWidth * ratio * 0.8); // 80% of allocated space for visual balance
  return `${Math.min(baseWidth, containerWidth * 0.3)}px`; // Cap at 30% of container to prevent overflow
};

type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  accessorKey?: string | number;
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
    priority?: number; // 1-5 scale, higher = more width priority
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
    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    // Handle non-array objects
    if (!Array.isArray(a) && !Array.isArray(b)) {
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
      className={`flex h-full items-center justify-center`}
      style={{ width: DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH }}
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

/**
 * Dynamic column width calculator using priority-based distribution
 * Computes relative widths based on semantic priorities and container size
 */
const useDynamicColumnWidths = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  containerRef: React.RefObject<HTMLDivElement>,
  isSmallScreen: boolean,
) => {
  // Stabilize columns array to prevent infinite re-renders
  const stableColumns = useMemo(() => {
    return columns.map((c) => ({
      id: c.id,
      accessorKey: c.accessorKey,
      meta: c.meta,
    }));
  }, [columns]);

  return useMemo(() => {
    // Get container width directly without state to prevent re-render loops
    const containerWidth = containerRef.current?.clientWidth || 0;

    if (containerWidth === 0) {
      return {};
    }

    // Calculate total priority
    const totalPriority = stableColumns.reduce((sum, column) => {
      const explicitPriority = column.meta?.priority;
      const priority = explicitPriority ?? 1; // uniform default
      return sum + priority;
    }, 0);

    if (totalPriority === 0) {
      return {};
    }

    const keyFor = (column: (typeof stableColumns)[0]): string =>
      String(column.id ?? column.accessorKey ?? '');

    const widths: number[] = [];
    const columnDetails: Array<{
      key: string;
      id: string;
      finalWidth: number;
      source: string;
      metaSize: string | number | undefined;
    }> = [];
    const result = stableColumns.reduce(
      (acc, column) => {
        const key = keyFor(column);
        if (!key) {
          return acc;
        }

        const explicitPriority = column.meta?.priority;
        const priority = explicitPriority ?? 1; // uniform default

        // Check for fixed size first
        let finalWidth: number;
        let source = 'calculated';
        const metaSize = column.meta?.size;

        if (metaSize && typeof metaSize === 'string' && metaSize.includes('px')) {
          finalWidth = (parseFloat(metaSize) / containerWidth) * 100; // Convert px to %
          source = 'fixed px';
        } else if (isSmallScreen && column.meta?.mobileSize) {
          const mobileSize = column.meta.mobileSize;
          if (typeof mobileSize === 'string' && mobileSize.includes('px')) {
            finalWidth = (parseFloat(mobileSize) / containerWidth) * 100;
            source = 'mobile px';
          } else {
            finalWidth = parseFloat(mobileSize as string) || (priority / totalPriority) * 100;
            source = 'mobile %';
          }
        } else {
          // Compute relative width as percentage
          const ratio = priority / totalPriority;
          finalWidth = Math.max(5, Math.min(60, ratio * 100)); // 5-60% range
          source = 'calculated %';
        }

        // Determine minWidth - prefer explicit, fallback to standard
        let minWidth: string | number | undefined;
        if (column.meta?.minWidth) {
          minWidth = column.meta.minWidth;
        } else {
          minWidth = 'min-content';
        }

        widths.push(finalWidth);
        columnDetails.push({ key, id: column.id || '', finalWidth, source, metaSize });

        acc[key] = {
          width: `${finalWidth}%`,
          minWidth,
          maxWidth: column.meta?.size || 'none',
          flex: `0 0 ${finalWidth}%`, // For flex fallback
          // Ensure content doesn't break layout
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        } as React.CSSProperties;

        return acc;
      },
      {} as Record<string, React.CSSProperties>,
    );

    // Diagnostic log: Check total width allocation
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);

    // Only log in development and when there are issues
    if (process.env.NODE_ENV === 'development' && totalWidth > 100) {
      console.warn(
        '[DataTable Debug] WARNING: Column widths exceed 100% - potential horizontal overflow!',
        { containerWidth, columnDetails, totalWidth },
      );
    }

    return result;
  }, [stableColumns, isSmallScreen, containerRef]);
};

// Legacy support hook - wraps dynamic widths with backward compatibility
const useColumnStyles = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  isSmallScreen: boolean,
  containerRef: React.RefObject<HTMLDivElement>,
): ReturnType<typeof useDynamicColumnWidths> => {
  return useDynamicColumnWidths(columns, containerRef, isSmallScreen);
};

const TableRowComponent = <TData,>({
  row,
  columnStyles,
  index,
  virtualIndex,
}: {
  row: Row<TData>;
  columnStyles: Record<string, React.CSSProperties>;
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
      className="motion-safe:animate-fadeIn border-b border-border-light opacity-100 transition-opacity duration-200 ease-out hover:bg-surface-secondary"
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

        return (
          <TableCell
            key={cell.id}
            className="w-0 max-w-0 px-2 py-1 align-middle text-xs transition-colors duration-200 sm:px-4 sm:py-2 sm:text-sm"
            style={{
              ...columnStyles[cell.column.id],
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
  }: {
    onDelete?: () => Promise<void>;
    isDeleting: boolean;
    disabled: boolean;
    isSmallScreen: boolean;
  }) => {
    if (!onDelete) return null;

    return (
      <Button
        variant="outline"
        onClick={onDelete}
        disabled={disabled}
        style={{ minWidth: DATA_TABLE_CONSTANTS.DELETE_BUTTON_MIN_WIDTH }}
        className={cn(
          `transition-all hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20`,
          isSmallScreen && 'px-2 py-1',
        )}
        aria-label={isDeleting ? 'Deleting selected rows' : 'Delete selected rows'}
      >
        {isDeleting ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <>
            <TrashIcon className="h-4 w-4 text-red-500 sm:h-4 sm:w-4" />
          </>
        )}
      </Button>
    );
  },
);

DeleteButton.displayName = 'DeleteButton';

/**
 * Dynamic skeleton rows that match final column proportions to prevent CLS
 * Uses same priority-based width calculation as real content
 */
const SkeletonRows = memo(function <TData, TValue>({
  count = 10,
  columns,
  columnStyles,
  containerRef,
}: {
  count?: number;
  columns: TableColumn<TData, TValue>[];
  columnStyles: Record<string, React.CSSProperties>;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  if (!columns.length || !containerRef.current) {
    return null;
  }

  const containerWidth = containerRef.current.clientWidth;

  // Calculate total priority for skeleton width distribution
  const totalPriority = columns.reduce((sum, column) => {
    const explicitPriority = column.meta?.priority;
    const priority = explicitPriority ?? 1; // uniform default
    return sum + priority;
  }, 0);

  if (totalPriority === 0) {
    return null;
  }

  // Helper function to get column key - same as in useDynamicColumnWidths
  const keyFor = (column: TableColumn<TData, TValue>): string =>
    String(column.id ?? column.accessorKey ?? '');

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableRow
          key={`skeleton-${index}`}
          className="h-12 border-b border-border-light"
          style={{ height: '48px' }}
        >
          {columns.map((column, colIndex) => {
            const columnKey = keyFor(column);
            const baseStyle = columnStyles[columnKey] || {};
            const explicitPriority = column.meta?.priority;
            const priority = explicitPriority ?? 1; // uniform default
            // Use priority-based width for all skeleton cells
            const skeletonWidth = getSkeletonWidth(priority, containerWidth, totalPriority);
            const skeletonStyle: React.CSSProperties = {
              ...baseStyle,
              width: skeletonWidth,
              minWidth: skeletonWidth,
              height: '48px',
            };

            return (
              <TableCell
                key={columnKey || `col-${colIndex}`}
                className="h-full px-2 py-1 sm:px-4 sm:py-2"
                style={skeletonStyle}
              >
                <Skeleton
                  className="h-full w-full animate-pulse"
                  style={{ width: '100%', height: '100%' }}
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
  // const prevPropsRef = useRef<PrevProps | null>(null); // Disabled with debug logging

  const tableConfig = useMemo(() => {
    return {
      enableRowSelection: config?.selection?.enableRowSelection ?? true,
      showCheckboxes: config?.selection?.showCheckboxes ?? true,
      enableSearch: config?.search?.enableSearch ?? true,
      filterColumn: config?.search?.filterColumn,
      skeletonCount: config?.skeleton?.count ?? 10,
      overscan: config?.virtualization?.overscan ?? DATA_TABLE_CONSTANTS.OVERS_CAN,
      debounceDelay: config?.search?.debounce ?? DATA_TABLE_CONSTANTS.SEARCH_DEBOUNCE_MS,
    };
  }, [config]);

  const {
    enableRowSelection,
    showCheckboxes,
    enableSearch,
    // filterColumn, // Disabled with debug logging
    skeletonCount,
    overscan,
    debounceDelay,
  } = tableConfig;

  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [optimizedRowSelection, setOptimizedRowSelection] = useOptimizedRowSelection();
  const [rawTerm, setRawTerm] = useState(filterValue ?? '');
  const [isImmediateSearch, setIsImmediateSearch] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedTerm = useDebounced(rawTerm, debounceDelay);

  const isTransitioning = isFetching || isImmediateSearch;

  // Track when we're waiting for search results
  const isWaitingForSearchResults = isSearching && isFetching;
  const isFirstLoad = isLoading && data.length === 0;
  const isRefreshing = isFetching && !isFirstLoad && !isFetchingNextPage && !isSearching;

  // Show skeletons during initial load, refresh, search, or transitioning
  // Exclude isFetchingNextPage to prevent skeletons during infinite scroll
  const showSkeletons =
    isFirstLoad ||
    isRefreshing ||
    isWaitingForSearchResults ||
    (isTransitioning && !isFetchingNextPage) || // Don't show skeletons during infinite scroll
    rawTerm !== debouncedTerm; // Show during typing

  // External sorting support: use provided sorting state, fall back to internal
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSort);
  const finalSorting = sorting ?? internalSorting;

  // Mount tracking for cleanup - Fixed: Declare mountedRef before any callback that uses it
  const mountedRef = useRef(true);

  // Sync internal sorting with defaultSort changes
  useEffect(() => {
    if (!sorting) setInternalSorting(defaultSort);
  }, [defaultSort, sorting]);

  // Keep search input in sync with external filterValue
  useEffect(() => {
    setRawTerm(filterValue ?? '');
  }, [filterValue]);

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

  renderCountRef.current += 1;

  const sanitizeError = useCallback((err: Error): string => {
    const message = err.message;
    if (message?.includes('auth') || message?.includes('token')) {
      return 'Authentication failed. Please log in again.';
    }
    return process.env.NODE_ENV === 'development'
      ? message
      : 'An error occurred. Please try again.';
  }, []);

  const tableColumns = useMemo(() => {
    if (!enableRowSelection || !showCheckboxes) return columns;

    const selectColumn: TableColumn<TData, boolean> = {
      id: 'select',
      header: ({ table }: { table: TTable<TData> }) => (
        <div
          className={`flex h-full items-center justify-center`}
          style={{ width: DATA_TABLE_CONSTANTS.CHECKBOX_WIDTH }}
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

  // Dynamic column styles with priority-based sizing
  const columnStyles = useColumnStyles(
    tableColumns as TableColumn<TData, TValue>[],
    isSmallScreen,
    tableContainerRef,
  );

  // Set CSS variables for column sizing with hash optimization - prevent re-render loops
  const columnSizesHashRef = useRef<string>('');
  const prevTableColumnsRef = useRef<typeof tableColumns>([]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !tableContainerRef.current) return;

    // Only update if columns or styles actually changed
    const columnsChanged = prevTableColumnsRef.current.length !== tableColumns.length;

    // Calculate hash of column sizes to avoid unnecessary DOM writes
    const sizesHash = tableColumns
      .map((col, index) => `${index}:${columnStyles[col.id!]?.width || 'auto'}`)
      .join('|');

    if (columnsChanged || sizesHash !== columnSizesHashRef.current) {
      columnSizesHashRef.current = sizesHash;
      prevTableColumnsRef.current = tableColumns;

      // Batch DOM updates to prevent layout thrashing
      requestAnimationFrame(() => {
        if (tableContainerRef.current) {
          tableColumns.forEach((column, index) => {
            if (column.id) {
              const size = columnStyles[column.id]?.width || 'auto';
              tableContainerRef.current!.style.setProperty(`--col-${index}-size`, `${size}`);
            }
          });
        }
      });
    }
  }, [tableColumns, columnStyles]);

  // Memoized row data with stable references - deep comparison to prevent unnecessary re-renders
  const memoizedRowData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      _index: index,
      _id: (item as Record<string, unknown>)?.id || index,
    }));
  }, [data]);

  // React Table instance
  const tableData = memoizedRowData;

  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection,
    enableMultiRowSelection: true,
    manualSorting: true, // Use manual sorting for server-side sorting
    manualFiltering: true,
    state: {
      sorting: finalSorting,
      columnVisibility,
      rowSelection: optimizedRowSelection,
    },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setOptimizedRowSelection,
  });

  const { rows } = table.getRowModel();

  // Fixed: Simplify header groups - React Table already memoizes internally
  const headerGroups = table.getHeaderGroups();

  // Virtual scrolling setup with optimized height measurement
  const measuredHeightsRef = useRef<number[]>([]);
  const measureElementCallback = useCallback((el: Element | null) => {
    if (!el) return DATA_TABLE_CONSTANTS.ROW_HEIGHT_ESTIMATE;

    const height = el.getBoundingClientRect().height;

    // Memory management for measured heights - only update if significantly different
    const lastHeight = measuredHeightsRef.current[measuredHeightsRef.current.length - 1];
    if (!lastHeight || Math.abs(height - lastHeight) > 1) {
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
    }

    return height;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => {
      // SSR safety: return null during SSR
      if (typeof window === 'undefined') return null;
      return tableContainerRef.current;
    }, []),
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
    measureElement: measureElementCallback,
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

  // Store scroll position before fetching to prevent jumping
  const scrollPositionRef = useRef<{ top: number; timestamp: number } | null>(null);
  const isRestoringScrollRef = useRef(false);

  // Fixed: Infinite scrolling with scroll position preservation
  const handleScrollInternal = useCallback(async () => {
    if (!mountedRef.current || !tableContainerRef.current) return;

    // Early return if conditions not met
    if (!hasNextPage || isFetchingNextPage || isRestoringScrollRef.current) return;

    const scrollElement = tableContainerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;

    // More precise threshold calculation
    const scrollThreshold =
      scrollHeight - clientHeight * DATA_TABLE_CONSTANTS.INFINITE_SCROLL_THRESHOLD;
    const nearEnd = scrollTop >= scrollThreshold;

    if (nearEnd) {
      try {
        // Store current scroll position before fetching
        scrollPositionRef.current = {
          top: scrollTop,
          timestamp: Date.now(),
        };

        await fetchNextPage?.();
      } catch (err) {
        // Clear stored position on error
        scrollPositionRef.current = null;
        const rawError = err instanceof Error ? err : new Error('Failed to fetch next page');
        const sanitizedMessage = sanitizeError(rawError);
        const sanitizedError = new Error(sanitizedMessage);
        setError(sanitizedError);
        onError?.(sanitizedError);
      }
    }
  }, [fetchNextPage, onError, sanitizeError, hasNextPage, isFetchingNextPage]);

  const throttledHandleScroll = useMemo(
    () => throttle(handleScrollInternal, DATA_TABLE_CONSTANTS.SCROLL_THROTTLE_MS),
    [handleScrollInternal],
  );

  // Scroll position restoration effect - prevents jumping when new data is added
  useEffect(() => {
    if (!isFetchingNextPage && scrollPositionRef.current && tableContainerRef.current) {
      const { top, timestamp } = scrollPositionRef.current;
      const isRecent = Date.now() - timestamp < 1000; // Only restore if within 1 second

      if (isRecent) {
        isRestoringScrollRef.current = true;

        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (tableContainerRef.current && mountedRef.current) {
            const scrollElement = tableContainerRef.current;
            const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
            const targetScroll = Math.min(top, maxScroll);

            scrollElement.scrollTo({
              top: targetScroll,
              behavior: 'auto', // Instant restoration
            });

            // Clear restoration flag after a brief delay
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 100);
          }
        });
      }

      // Clear stored position
      scrollPositionRef.current = null;
    }
  }, [isFetchingNextPage, data.length]); // Trigger when fetch completes or data changes

  // Always attach scroll listener with optimized event handling to reduce GC pressure
  useEffect(() => {
    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    // Pre-bind the handler to avoid creating new functions on each scroll
    const scrollHandler = throttledHandleScroll;

    // Use passive listener for better performance
    const options = { passive: true };
    scrollElement.addEventListener('scroll', scrollHandler, options);

    return () => {
      scrollElement.removeEventListener('scroll', scrollHandler);
    };
  }, [throttledHandleScroll]);

  // Resize observer for virtualizer revalidation - heavily throttled to prevent rapid re-renders
  const handleWindowResize = useCallback(() => {
    // Debounce resize to prevent rapid re-renders
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        rowVirtualizer.measure();
      }
    }, 250); // Increased delay significantly
  }, [rowVirtualizer]);

  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Optimized resize observer with reduced layout thrashing
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scrollElement = tableContainerRef.current;
    if (!scrollElement) return;

    // Increased throttling to reduce excessive re-renders and GC pressure
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastResizeTime = 0;
    const MIN_RESIZE_INTERVAL = 500; // Increased from 250ms to reduce GC pressure

    const resizeObserver = new ResizeObserver(() => {
      const now = Date.now();
      if (now - lastResizeTime < MIN_RESIZE_INTERVAL) return;

      lastResizeTime = now;
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          // Only measure if not currently restoring scroll position
          rowVirtualizer.measure();
        }
      }, MIN_RESIZE_INTERVAL);
    });

    resizeObserver.observe(scrollElement);

    // Optimized window resize handler with increased debouncing
    const windowResizeHandler = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          rowVirtualizer.measure();
        }
      }, MIN_RESIZE_INTERVAL);
    };

    window.addEventListener('resize', windowResizeHandler, { passive: true });

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeObserver.disconnect();
      window.removeEventListener('resize', windowResizeHandler);
    };
  }, [rowVirtualizer, handleWindowResize]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Optimized dynamic measurement - prevent infinite loops with better guards and reduced frequency
  const lastMeasurementRef = useRef<{
    dataLength: number;
    isSmallScreen: boolean;
    virtualRowsLength: number;
    isTransitioning: boolean;
    timestamp: number;
  }>({
    dataLength: 0,
    isSmallScreen: false,
    virtualRowsLength: 0,
    isTransitioning: false,
    timestamp: 0,
  });

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || isTransitioning || isRestoringScrollRef.current) return;

    const current = {
      dataLength: data.length,
      isSmallScreen,
      virtualRowsLength: virtualRowsWithStableKeys.length,
      isTransitioning,
      timestamp: Date.now(),
    };

    const timeSinceLastMeasurement = current.timestamp - lastMeasurementRef.current.timestamp;

    // Only measure if something meaningful changed AND enough time has passed
    const hasChanged =
      current.dataLength !== lastMeasurementRef.current.dataLength ||
      current.isSmallScreen !== lastMeasurementRef.current.isSmallScreen ||
      current.virtualRowsLength !== lastMeasurementRef.current.virtualRowsLength;

    // Increased throttle to 200ms to reduce GC pressure and improve performance
    if (!hasChanged || timeSinceLastMeasurement < 200) return;

    lastMeasurementRef.current = current;

    if (mountedRef.current && tableContainerRef.current && virtualRows.length > 0) {
      // Increased debounce delay to reduce re-renders
      const measurementTimeout = setTimeout(() => {
        if (mountedRef.current && !isRestoringScrollRef.current) {
          rowVirtualizer.measure();
        }
      }, 100);

      return () => clearTimeout(measurementTimeout);
    }
  }, [
    data.length,
    rowVirtualizer,
    isSmallScreen,
    virtualRowsWithStableKeys.length,
    virtualRows.length,
    isTransitioning,
  ]);

  // Search effect with optimized state updates
  useEffect(() => {
    if (rawTerm !== filterValue) {
      setIsImmediateSearch(true);
    }
  }, [rawTerm, filterValue]);

  useEffect(() => {
    if (debouncedTerm !== filterValue) {
      setIsSearching(true);
      startTransition(() => {
        onFilterChange?.(debouncedTerm);
      });
    }
  }, [debouncedTerm, onFilterChange, filterValue]);

  useEffect(() => {
    if (!isFetching && isImmediateSearch) {
      setIsImmediateSearch(false);
    }
  }, [isFetching, isImmediateSearch]);

  useEffect(() => {
    if (!isFetching && isSearching) {
      setIsSearching(false);
    }
  }, [isFetching, isSearching]);

  // Optimized delete handler with batch operations
  const handleDelete = useCallback(async () => {
    if (!onDelete || isDeleting) return;

    setIsDeleting(true);
    setError(null);

    try {
      // Use getSelectedRowModel instead of getFilteredSelectedRowModel
      const selectedRowsLength = table.getSelectedRowModel().rows.length;
      let selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

      // Validation
      if (selectedRows.length === 0) {
        setIsDeleting(false);
        return;
      }

      // Filter out non-object entries
      selectedRows = selectedRows.filter(
        (row): row is TData => typeof row === 'object' && row !== null,
      );

      // TODO: Remove this - only for development
      if (selectedRows.length !== selectedRowsLength && true) {
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

  const selectedCount = useMemo(() => {
    const selection = optimizedRowSelection;
    return Object.keys(selection).length;
  }, [optimizedRowSelection]);

  const shouldShowSearch = useMemo(
    () => enableSearch && !!onFilterChange,
    [enableSearch, onFilterChange],
  );

  return (
    <div
      className={cn('flex h-full flex-col gap-4', className)}
      role="region"
      aria-label="Data table"
    >
      {/* Accessible live region for loading announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {(() => {
          if (isSearching) return 'Searching...';
          if (isFetchingNextPage) return 'Loading more rows';
          if (hasNextPage) return 'More rows available';
          return 'All rows loaded';
        })()}
      </div>

      {/* Error display - kept outside boundary for non-rendering errors */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
          {sanitizeError(error)}
          <Button
            variant="ghost"
            onClick={() => setError(null)}
            className="ml-2 h-auto p-0 text-red-700 underline hover:no-underline dark:text-red-400"
          >
            ×
          </Button>
        </div>
      )}

      {/* Isolated Toolbar - Outside scroll container */}
      <div className="sticky top-0 z-50 w-full bg-background">
        <div
          className="flex flex-wrap items-center gap-2 shadow-sm backdrop-blur-sm sm:gap-4"
          style={{ height: '4rem' }}
        >
          {enableRowSelection && showCheckboxes && (
            <DeleteButton
              onDelete={onDelete ? handleDelete : undefined}
              isDeleting={isDeleting}
              disabled={!selectedCount || isDeleting}
              isSmallScreen={isSmallScreen}
            />
          )}

          {shouldShowSearch && (
            <div
              className="relative flex-1"
              style={{
                minWidth: DATA_TABLE_CONSTANTS.SEARCH_INPUT_MIN_WIDTH,
                contain: 'layout paint',
                overflow: 'hidden',
              }}
            >
              <AnimatedSearchInput
                value={rawTerm}
                onChange={(e) => {
                  startTransition(() => setRawTerm(e.target.value));
                }}
                isSearching={isWaitingForSearchResults}
                placeholder="Search..."
                aria-label="Search table data"
              />
            </div>
          )}

          {selectedCount > 0 && (
            <div className="text-sm text-text-secondary">{`${selectedCount} selected`}</div>
          )}
        </div>
      </div>

      {/* Error boundary wraps the scrollable table container */}
      <DataTableErrorBoundary onError={onError} onReset={handleBoundaryReset}>
        <div
          ref={tableContainerRef}
          className={cn(
            `relative h-[calc(100vh-24rem)] max-w-full overflow-auto rounded-lg border border-black/10 dark:border-white/10`,
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 transition-all ease-out',
            isRefreshing && 'bg-surface-secondary/30',
          )}
          style={{
            contain: 'layout size strict',
            minWidth: DATA_TABLE_CONSTANTS.TABLE_MIN_WIDTH,
            maxWidth: '100%',
            boxSizing: 'border-box',
            transitionDuration: DATA_TABLE_CONSTANTS.ROW_TRANSITION_DURATION,
          }}
          onWheel={(e) => {
            if (isFetchingNextPage) {
              e.preventDefault();
              return;
            }
            if (isTransitioning) {
              e.deltaY *= 0.5;
            }
          }}
          role="grid"
          aria-label="Data grid"
          aria-rowcount={data.length}
          aria-busy={isLoading || isFetching || isFetchingNextPage}
        >
          <div className="w-full" style={{ width: '100%' }}>
            <Table
              className="w-full table-fixed border-separate border-spacing-0"
              style={{
                borderCollapse: 'separate',
                minWidth: DATA_TABLE_CONSTANTS.TABLE_MIN_WIDTH,
                maxWidth: '100%',
                tableLayout: 'fixed',
                width: '100%',
              }}
            >
              {/* Sticky Table Header - Fixed z-index and positioning */}
              <TableHeader
                className="sticky border-b border-border-light bg-surface-secondary backdrop-blur-sm"
                style={{
                  height: '40px',
                  zIndex: 10, // Lower, toolbar is now outside
                  top: 0,
                }}
              >
                {headerGroups.map((headerGroup) => (
                  <TableRow
                    key={headerGroup.id}
                    className="border-b border-border-light"
                    role="row"
                  >
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
                            'group relative box-border whitespace-nowrap bg-surface-secondary px-2 py-3 text-left text-sm font-medium text-text-secondary transition-colors duration-200 sm:px-4',
                            canSort &&
                              'cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          )}
                          style={{
                            ...columnStyles[header.column.id],
                            backgroundColor: 'var(--surface-secondary)',
                            position: 'sticky',
                            top: 0,
                            boxSizing: 'border-box',
                            maxWidth: 'none',
                          }}
                          role="columnheader"
                          scope="col"
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
                    containerRef={tableContainerRef}
                  />
                ) : (
                  virtualRowsWithStableKeys.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    return (
                      <MemoizedTableRow
                        key={virtualRow.stableKey}
                        row={row}
                        columnStyles={columnStyles}
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
                      {debouncedTerm ? localize('com_ui_no_results_found') : 'No data available'}
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
                          <Spinner className="h-4 w-4" aria-label="Loading more data" />
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
      </DataTableErrorBoundary>
    </div>
  );
}
