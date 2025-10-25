import type { ColumnDef, SortingState, Table } from '@tanstack/react-table';
import type React from 'react';

export type TableColumn<TData, TValue> = ColumnDef<TData, TValue> & {
  accessorKey?: string | number;
  meta?: {
    size?: string | number;
    mobileSize?: string | number;
    minWidth?: string | number;
    priority?: number;
  };
};

export interface DataTableConfig {
  selection?: {
    enableRowSelection?: boolean;
    showCheckboxes?: boolean;
  };
  search?: {
    enableSearch?: boolean;
    debounce?: number;
    filterColumn?: string;
  };
  skeleton?: {
    count?: number;
  };
  virtualization?: {
    overscan?: number;
  };
  pinning?: {
    enableColumnPinning?: boolean;
  };
}

export interface DataTableProps<TData extends Record<string, unknown>, TValue> {
  columns: TableColumn<TData, TValue>[];
  data: TData[];
  className?: string;
  isLoading?: boolean;
  isFetching?: boolean;
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
  conversationIndex?: number;
  customActionsRenderer?: (params: {
    selectedCount: number;
    selectedRows: TData[];
    table: Table<TData & { _id: string }>;
    showToast: (message: string) => void;
  }) => React.ReactNode;
}

export interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}
