import { memo } from 'react';
import { flexRender } from '@tanstack/react-table';
import type { TableColumn } from './DataTable.types';
import type { Row } from '@tanstack/react-table';
import { TableCell, TableRow } from '../Table';
import { Checkbox } from '../Checkbox';
import { Skeleton } from '../Skeleton';
import { cn } from '~/utils';

export const SelectionCheckbox = memo(
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
      className="flex h-full w-[30px] items-center justify-center"
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

const TableRowComponent = <TData extends Record<string, unknown>>({
  row,
  virtualIndex,
}: {
  row: Row<TData>;
  virtualIndex?: number;
}) => (
  <TableRow
    data-state={row.getIsSelected() ? 'selected' : undefined}
    data-index={virtualIndex}
    className="border-none hover:bg-surface-secondary"
  >
    {row.getVisibleCells().map((cell) => {
      const meta = cell.column.columnDef.meta as
        | { className?: string; desktopOnly?: boolean }
        | undefined;
      const isDesktopOnly = meta?.desktopOnly;
      return (
        <TableCell
          key={cell.id}
          className={cn(
            'truncate p-3',
            cell.column.id === 'select' && 'p-1',
            meta?.className,
            isDesktopOnly && 'hidden md:table-cell',
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      );
    })}
  </TableRow>
);

export const MemoizedTableRow = memo(
  TableRowComponent,
  (prev, next) =>
    prev.row.original === next.row.original &&
    prev.row.getIsSelected() === next.row.getIsSelected(),
);

export const SkeletonRows = memo(
  <TData extends Record<string, unknown>, TValue>({
    count = 10,
    columns,
  }: {
    count?: number;
    columns: TableColumn<TData, TValue>[];
  }) => (
    <>
      {Array.from({ length: count }, (_, index) => (
        <TableRow key={`skeleton-${index}`} className="h-[56px] border-b border-border-light">
          {columns.map((column) => {
            const columnKey = String(
              column.id ?? ('accessorKey' in column && column.accessorKey) ?? '',
            );
            const meta = column.meta as { className?: string; desktopOnly?: boolean } | undefined;
            return (
              <TableCell
                key={columnKey}
                className={cn(
                  'px-2 py-2 md:px-3',
                  meta?.className,
                  meta?.desktopOnly && 'hidden md:table-cell',
                )}
              >
                <Skeleton className="h-6 w-full" />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  ),
);

SkeletonRows.displayName = 'SkeletonRows';
