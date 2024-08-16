import { useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { LucideArrowUpLeft } from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import type { AugmentedColumnDef } from '~/common';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import store from '~/store';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export default function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [paginationState, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const setShowFiles = useSetRecoilState(store.showFiles);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    getPaginationRowModel: getPaginationRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination: paginationState,
    },
    defaultColumn: {
      minSize: 0,
      size: 10,
      maxSize: 10,
      enableResizing: true,
    },
  });

  return (
    <>
      <div className="flex items-center gap-4 py-4">
        <Input
          placeholder={localize('com_files_filter')}
          value={(table.getColumn('filename')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('filename')?.setFilterValue(event.target.value)}
          className="w-full border-border-light"
        />
      </div>
      <div className="overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
        <Table className="border-separate border-spacing-0 ">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup, index) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: index === 0 ? '75%' : '25%' }}
                      className="sticky top-0 h-auto bg-white py-1 text-left font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-100"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-black/10 text-left text-gray-600 dark:border-white/10 dark:text-gray-300 [tr:last-child_&]:border-b-0"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="p-2 px-4 [tr[data-disabled=true]_&]:opacity-50"
                      style={{
                        maxWidth: (cell.column.columnDef as AugmentedColumnDef<TData, TValue>).meta
                          .size,
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {localize('com_files_no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFiles(true)}
            className="flex gap-2"
          >
            <LucideArrowUpLeft className="icon-sm" />
            {localize('com_sidepanel_manage_files')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {localize('com_ui_prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </>
  );
}
