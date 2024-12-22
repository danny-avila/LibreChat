import { useState, useCallback } from 'react';
import { ArrowUpLeft } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
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
import {
  fileConfig as defaultFileConfig,
  checkOpenAIStorage,
  mergeFileConfig,
  megabyte,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
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
import { useFileMapContext, useChatContext, useToastContext } from '~/Providers';
import { useLocalize, useUpdateFiles } from '~/hooks';
import { useGetFileConfig } from '~/data-provider';
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
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { setFiles, conversation } = useChatContext();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const { addFile } = useUpdateFiles(setFiles);

  const handleFileClick = useCallback((file: any) => {
    const endpoint = conversation?.endpoint;
    const fileData = fileMap?.[file.file_id];

    if (!fileData) {
      return;
    }

    if (!endpoint) {
      return showToast({ message: localize('com_ui_attach_error'), status: 'error' });
    }

    if (!fileData.source) {
      return;
    }

    if (checkOpenAIStorage(fileData.source) && !isAssistantsEndpoint(endpoint)) {
      return showToast({
        message: localize('com_ui_attach_error_openai'),
        status: 'error',
      });
    } else if (!checkOpenAIStorage(fileData.source) && isAssistantsEndpoint(endpoint)) {
      showToast({
        message: localize('com_ui_attach_warn_endpoint'),
        status: 'warning',
      });
    }

    const { fileSizeLimit, supportedMimeTypes } =
      fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;

    if (fileData.bytes > fileSizeLimit) {
      return showToast({
        message: `${localize('com_ui_attach_error_size')} ${
          fileSizeLimit / megabyte
        } MB (${endpoint})`,
        status: 'error',
      });
    }

    const isSupportedMimeType = defaultFileConfig.checkType(file.type, supportedMimeTypes);

    if (!isSupportedMimeType) {
      return showToast({
        message: `${localize('com_ui_attach_error_type')} ${file.type} (${endpoint})`,
        status: 'error',
      });
    }

    addFile({
      progress: 1,
      attached: true,
      file_id: fileData.file_id,
      filepath: fileData.filepath,
      preview: fileData.filepath,
      type: fileData.type,
      height: fileData.height,
      width: fileData.width,
      filename: fileData.filename,
      source: fileData.source,
      size: fileData.bytes,
    });
  }, [addFile, fileMap, conversation, localize, showToast, fileConfig.endpoints]);

  return (
    <div role="region" aria-label={localize('com_files_table')} className="mt-2 space-y-2">
      <div className="flex items-center gap-4">
        <Input
          placeholder={localize('com_files_filter')}
          value={table.getColumn('filename')?.getFilterValue() as string}
          onChange={(event) => table.getColumn('filename')?.setFilterValue(event.target.value)}
          aria-label={localize('com_files_filter')}
        />
      </div>

      <div className="rounded-lg border border-border-light bg-transparent shadow-sm transition-colors">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup, index) => (
                <TableRow key={headerGroup.id} className="border-b border-border-light">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: index === 0 ? '75%' : '25%' }}
                      className="bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary"
                      scope="col"
                    >
                      <div className="px-4">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="border-b border-border-light transition-colors hover:bg-surface-secondary [&:last-child]:border-0 cursor-pointer"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        onClick={() => handleFileClick(row.original)}
                        className="rounded-lg p-4 text-sm text-text-primary outline-none focus-visible:bg-surface-active"
                        style={{
                          maxWidth: (cell.column.columnDef as AugmentedColumnDef<TData, TValue>)
                            .meta?.size,
                        }}
                        tabIndex={0}
                        role="gridcell"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-text-secondary"
                  >
                    {localize('com_files_no_results')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFiles(true)}
          aria-label={localize('com_sidepanel_manage_files')}
        >
          <ArrowUpLeft className="h-4 w-4" />
          {localize('com_sidepanel_manage_files')}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={localize('com_ui_prev')}
          >
            {localize('com_ui_prev')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={localize('com_ui_next')}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </div>
  );
}