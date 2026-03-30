import { useCallback, useMemo } from 'react';

interface UseVirtualGridProps {
  itemCount: number;
  containerWidth: number;
  itemHeight: number;
  gapSize: number;
  mobileColumnsCount: number;
  desktopColumnsCount: number;
  mobileBreakpoint: number;
}

interface UseVirtualGridReturn {
  cardsPerRow: number;
  rowCount: number;
  rowHeight: number;
  getRowItems: (rowIndex: number, items: any[]) => any[];
}

/**
 * Custom hook for virtual grid calculations
 * Handles responsive grid layout and item positioning for virtualized lists
 */
export const useVirtualGrid = ({
  itemCount,
  containerWidth,
  itemHeight,
  gapSize,
  mobileColumnsCount,
  desktopColumnsCount,
  mobileBreakpoint = 768,
}: UseVirtualGridProps): UseVirtualGridReturn => {
  // Calculate cards per row based on container width
  const cardsPerRow = useMemo(() => {
    return containerWidth >= mobileBreakpoint ? desktopColumnsCount : mobileColumnsCount;
  }, [containerWidth, mobileBreakpoint, desktopColumnsCount, mobileColumnsCount]);

  // Calculate total number of rows needed
  const rowCount = useMemo(() => {
    return Math.ceil(itemCount / cardsPerRow);
  }, [itemCount, cardsPerRow]);

  // Calculate row height including gap
  const rowHeight = useMemo(() => {
    return itemHeight + gapSize;
  }, [itemHeight, gapSize]);

  // Get items for a specific row
  const getRowItems = useCallback(
    (rowIndex: number, items: any[]) => {
      const startIndex = rowIndex * cardsPerRow;
      const endIndex = Math.min(startIndex + cardsPerRow, items.length);
      return items.slice(startIndex, endIndex);
    },
    [cardsPerRow],
  );

  return {
    cardsPerRow,
    rowCount,
    rowHeight,
    getRowItems,
  };
};

export default useVirtualGrid;
