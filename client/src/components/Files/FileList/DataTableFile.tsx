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
import { FileContext } from 'librechat-data-provider';
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
import { TrashIcon, Spinner } from '~/components/svg';
import useLocalize from '~/hooks/useLocalize';
import ActionButton from '../ActionButton';
import UploadFileButton from './UploadFileButton';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

const contextMap = {
  [FileContext.filename]: 'com_ui_name',
  [FileContext.updatedAt]: 'com_ui_date',
  [FileContext.filterSource]: 'com_ui_storage',
  [FileContext.context]: 'com_ui_context',
  [FileContext.bytes]: 'com_ui_size',
};

type Style = { width?: number | string; maxWidth?: number | string; minWidth?: number | string };

export default function DataTableFile<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
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
      <div className="mt-2 flex flex-col items-start">
        <h2 className="text-lg">
          <strong>Files</strong>
        </h2>
        <div className="mt-3 flex w-full flex-col-reverse justify-between md:flex-row">
          <div className="mt-3 flex w-full flex-row justify-center gap-x-3 md:m-0 md:justify-start">
            <ActionButton
              onClick={() => {
                console.log('click');
              }}
            />
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
              className="ml-1 gap-2 dark:hover:bg-gray-850/25 sm:ml-0"
              disabled={!table.getFilteredSelectedRowModel().rows.length || isDeleting}
            >
              {isDeleting ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <TrashIcon className="h-4 w-4 text-red-400" />
              )}
              {localize('com_ui_delete')}
            </Button>
          </div>
          <div className="flex w-full flex-row gap-x-3">
            {' '}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto border border-border-medium">
                  <ListFilter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[1001] dark:border-gray-700 dark:bg-gray-850"
              >
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="cursor-pointer capitalize dark:text-white dark:hover:bg-gray-800"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                      >
                        {localize(contextMap[column.id])}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              placeholder={localize('com_files_filter')}
              value={(table.getColumn('filename')?.getFilterValue() as string | undefined) ?? ''}
              onChange={(event) => table.getColumn('filename')?.setFilterValue(event.target.value)}
              className="max-w-sm border-border-medium placeholder:text-text-secondary"
            />
            <UploadFileButton onClick={() => console.log('click')} />
          </div>
        </div>
      </div>
      <div className="relative mt-3 max-h-[25rem] min-h-0 overflow-y-auto rounded-md border border-black/10 pb-4 dark:border-white/10 sm:min-h-[28rem]">
        <Table className="w-full min-w-[600px] border-separate border-spacing-0">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header, index) => {
                  const style: Style = { maxWidth: '32px', minWidth: '125px' };
                  if (header.id === 'filename') {
                    style.maxWidth = '25%';
                    style.width = '25%';
                    style.minWidth = '150px';
                  }
                  if (header.id === 'icon') {
                    style.width = '25px';
                    style.maxWidth = '25px';
                    style.minWidth = '35px';
                  }
                  if (header.id === 'vectorStores') {
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
                      className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className="border-b border-black/10 text-left text-gray-600 dark:border-white/10 dark:text-gray-300 [tr:last-child_&]:border-b-0"
                >
                  {row.getVisibleCells().map((cell, index) => {
                    const maxWidth =
                      (cell.column.columnDef as AugmentedColumnDef<TData, TValue>).meta?.size ??
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
                  {localize('com_files_no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="ml-4 mr-4 mt-4 flex h-auto items-center justify-end space-x-2 py-4 sm:ml-0 sm:mr-0 sm:h-0">
        <div className="text-muted-foreground ml-2 flex-1 text-sm">
          {localize(
            'com_files_number_selected', {
              0: `${table.getFilteredSelectedRowModel().rows.length}`,
              1: `${table.getFilteredRowModel().rows.length}`,
            },
          )}
        </div>
        <Button
          className="dark:border-gray-500 dark:hover:bg-gray-600"
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {localize('com_ui_prev')}
        </Button>
        <Button
          className="dark:border-gray-500 dark:hover:bg-gray-600"
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {localize('com_ui_next')}
        </Button>
      </div>
    </>
  );
}
