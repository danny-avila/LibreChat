import * as React from 'react';
import { ListFilter } from 'lucide-react';
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
import type { TFile } from 'librechat-data-provider';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import { useDeleteFilesFromTable } from '~/hooks/Files';
import { NewTrashIcon, Spinner } from '~/components/svg';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

type Style = { width?: number | string; maxWidth?: number | string; minWidth?: number | string };

export default function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const { deleteFiles } = useDeleteFilesFromTable(() => setIsDeleting(false));

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
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
    },
  });

  return (
    <>
      <div className="flex items-center gap-4 py-4">
        <Button
          variant="ghost"
          onClick={() => {
            setIsDeleting(true);
            const filesToDelete = table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original);
            deleteFiles({ files: filesToDelete as TFile[] });
            setRowSelection({});
          }}
          className="gap-2"
          disabled={!table.getFilteredSelectedRowModel().rows.length || isDeleting}
        >
          {isDeleting ? (
            <Spinner className="ml-2 h-4 w-4" />
          ) : (
            <NewTrashIcon className="ml-2 h-4 w-4 text-red-400" />
          )}
          Delete
        </Button>
        <Input
          placeholder="Filter files..."
          value={(table.getColumn('filename')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('filename')?.setFilterValue(event.target.value)}
          className="max-w-sm dark:border-gray-700"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              <ListFilter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          {/* Filter Menu */}
          <DropdownMenuContent align="end" className="z-[1001] dark:border-gray-700 dark:bg-black">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="cursor-pointer capitalize dark:text-white dark:hover:bg-gray-800"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="relative max-h-[25rem] min-h-0 overflow-y-auto rounded-md border border-black/10 pb-4 dark:border-white/10 sm:min-h-[28rem]">
        <Table className="w-full min-w-[600px] border-separate border-spacing-0">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  const style: Style = { maxWidth: '32px', minWidth: '125px' };
                  if (header.id === 'filename') {
                    style.maxWidth = '50%';
                    style.width = '50%';
                    style.minWidth = '300px';
                  }

                  if (index === 0 && header.id === 'select') {
                    style.width = '25px';
                    style.maxWidth = '25px';
                    style.minWidth = '35px';
                  }
                  return (
                    <TableHead
                      key={header.id}
                      className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-900 dark:text-gray-100 sm:px-4 sm:py-2"
                      style={style}
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-black/10 text-left text-gray-600 dark:border-white/10 dark:text-gray-300 [tr:last-child_&]:border-b-0"
                >
                  {row.getVisibleCells().map((cell, index) => {
                    const maxWidth =
                      (cell.column.columnDef as AugmentedColumnDef<TData, TValue>)?.meta?.size ??
                      'auto';

                    const style: Style = {};
                    if (cell.column.id === 'filename') {
                      style.maxWidth = maxWidth;
                    } else if (index === 0) {
                      style.maxWidth = '20px';
                    }

                    return (
                      <TableCell
                        key={cell.id}
                        className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                        style={style}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="ml-4 mr-4 mt-4 flex h-auto items-center justify-end space-x-2 py-4 sm:ml-0 sm:mr-0 sm:h-0">
        <div className="text-muted-foreground ml-2 flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} file(s) selected.
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </>
  );
}
