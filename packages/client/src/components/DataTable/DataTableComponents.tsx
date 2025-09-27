import React, { memo, forwardRef } from 'react';
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

const TableRowComponent = <TData extends Record<string, unknown>>(
  {
    row,
    virtualIndex,
    style,
    selected,
  }: {
    row: Row<TData>;
    virtualIndex?: number;
    style?: React.CSSProperties;
    selected: boolean;
  },
  ref: React.Ref<HTMLTableRowElement>,
) => (
  <TableRow
    ref={ref}
    data-state={selected ? 'selected' : undefined}
    data-index={virtualIndex}
    className="border-none hover:bg-surface-secondary"
    style={style}
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

type ForwardTableRowComponentType = <TData extends Record<string, unknown>>(
  props: {
    row: Row<TData>;
    virtualIndex?: number;
    style?: React.CSSProperties;
  } & React.RefAttributes<HTMLTableRowElement>,
) => JSX.Element;

const ForwardTableRowComponent = forwardRef(TableRowComponent) as ForwardTableRowComponentType;

interface GenericRowProps {
  row: Row<Record<string, unknown>>;
  virtualIndex?: number;
  style?: React.CSSProperties;
  selected: boolean;
}

export const MemoizedTableRow = memo(
  ForwardTableRowComponent as (props: GenericRowProps) => JSX.Element,
  (prev: GenericRowProps, next: GenericRowProps) =>
    prev.row.original === next.row.original && prev.selected === next.selected,
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
