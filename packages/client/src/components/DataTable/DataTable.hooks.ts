import { useState, useEffect, useMemo } from 'react';
import type { TableColumn } from './DataTable.types';

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export const useOptimizedRowSelection = (initialSelection: Record<string, boolean> = {}) => {
  const [selection, setSelection] = useState(initialSelection);
  return [selection, setSelection] as const;
};

export const useColumnStyles = <TData, TValue>(
  columns: TableColumn<TData, TValue>[],
  isSmallScreen: boolean,
  containerRef: React.RefObject<HTMLDivElement>,
) => {
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.clientWidth);
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    updateWidth();

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  return useMemo(() => {
    if (containerWidth === 0) {
      return {};
    }

    const styles: Record<string, React.CSSProperties> = {};
    let totalFixedWidth = 0;
    const flexibleColumns: (TableColumn<TData, TValue> & { priority: number })[] = [];

    columns.forEach((column) => {
      const key = String(column.id ?? column.accessorKey ?? '');
      const size = isSmallScreen ? column.meta?.mobileSize : column.meta?.size;

      if (size) {
        const width = parseInt(String(size), 10);
        totalFixedWidth += width;
        styles[key] = {
          width: size,
          minWidth: column.meta?.minWidth || size,
        };
      } else {
        flexibleColumns.push({ ...column, priority: column.meta?.priority ?? 1 });
      }
    });

    const availableWidth = containerWidth - totalFixedWidth;
    const totalPriority = flexibleColumns.reduce((sum, col) => sum + col.priority, 0);

    if (availableWidth > 0 && totalPriority > 0) {
      flexibleColumns.forEach((column) => {
        const key = String(column.id ?? column.accessorKey ?? '');
        const proportion = column.priority / totalPriority;
        const width = Math.max(Math.floor(availableWidth * proportion), 80); // min width of 80px
        styles[key] = {
          width: `${width}px`,
          minWidth: column.meta?.minWidth ?? `${isSmallScreen ? 60 : 80}px`,
        };
      });
    }

    return styles;
  }, [columns, containerWidth, isSmallScreen]);
};

export const useDynamicColumnWidths = useColumnStyles;

export const useKeyboardNavigation = (
  tableRef: React.RefObject<HTMLDivElement>,
  rowCount: number,
  onRowSelect?: (index: number) => void,
) => {
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!tableRef.current?.contains(event.target as Node)) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setFocusedRowIndex((prev) => Math.min(prev + 1, rowCount - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedRowIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          event.preventDefault();
          setFocusedRowIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusedRowIndex(rowCount - 1);
          break;
        case 'Enter':
        case ' ':
          if (focusedRowIndex >= 0 && onRowSelect) {
            event.preventDefault();
            onRowSelect(focusedRowIndex);
          }
          break;
        case 'Escape':
          setFocusedRowIndex(-1);
          (event.target as HTMLElement).blur();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tableRef, rowCount, focusedRowIndex, onRowSelect]);

  return { focusedRowIndex, setFocusedRowIndex };
};
